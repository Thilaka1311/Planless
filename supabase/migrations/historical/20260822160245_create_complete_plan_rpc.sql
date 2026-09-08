-- Migration: Create complete_plan RPC
-- Description: Authoritative backend operation to complete a plan, finalize participant attendance/states, and handle early completion.

CREATE OR REPLACE FUNCTION public.complete_plan(
  p_plan_id UUID,
  p_attendance_input JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_host_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_rsvp_deadline TIMESTAMPTZ;
  v_participant RECORD;
  v_input_attendance attendance_status;
  v_final_attendance attendance_status;
  v_final_state rsvp_status;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan and host
  SELECT host_id, status, scheduled_at, rsvp_deadline
  INTO v_host_id, v_plan_status, v_scheduled_at, v_rsvp_deadline
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; -- Lock plan row to prevent concurrent completions

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_ALREADY_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 3. Validate attendance input
  -- The input JSON array looks like:
  -- [{"user_id": "uuid", "attendance": "ATTENDED" | "DID_NOT_ATTEND"}, ...]

  -- Ensure valid JSON array
  IF jsonb_typeof(p_attendance_input) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE_FORMAT' USING ERRCODE = '40000';
  END IF;

  -- Check if any user_id in input does not belong to the plan
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID NOT IN (
      SELECT user_id FROM public.plan_participants WHERE plan_id = p_plan_id
    )
  ) THEN
    RAISE EXCEPTION 'INVALID_PARTICIPANT' USING ERRCODE = '40000';
  END IF;

  -- Check if host is marked absent
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_host_id
      AND (item->>'attendance') = 'DID_NOT_ATTEND'
  ) THEN
    RAISE EXCEPTION 'HOST_CANNOT_BE_MARKED_ABSENT' USING ERRCODE = '40000';
  END IF;

  -- 4. Finalize attendance for all participants
  FOR v_participant IN
    SELECT user_id, rsvp_status, skip_reason
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
    FOR UPDATE
  LOOP
    -- Look for explicit input for this participant
    -- We use a subquery that might return null if not found
    SELECT (item->>'attendance')::attendance_status
    INTO v_input_attendance
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_participant.user_id;

    IF v_participant.user_id = v_host_id THEN
      -- Host always attends
      v_final_attendance := 'ATTENDED'::attendance_status;
      v_final_state := 'JOINED'::rsvp_status;

    ELSIF v_input_attendance IS NOT NULL THEN
      -- Explicit attendance submitted
      v_final_attendance := v_input_attendance;
      IF v_input_attendance = 'ATTENDED'::attendance_status THEN
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;

    ELSE
      -- No explicit attendance submitted. Use defaults based on rules:
      IF v_participant.rsvp_status = 'JOINED'::rsvp_status THEN
        v_final_attendance := 'ATTENDED'::attendance_status;
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        -- WAITLISTED, INVITED, SKIPPED default to DID_NOT_ATTEND
        v_final_attendance := 'DID_NOT_ATTEND'::attendance_status;
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;
    END IF;

    -- Update the participant record (bypasses RLS due to SECURITY DEFINER)
    UPDATE public.plan_participants
    SET final_attendance = v_final_attendance,
        final_state = v_final_state,
        updated_at = now()
    WHERE plan_id = p_plan_id AND user_id = v_participant.user_id;

  END LOOP;

  -- 5. Early Completion & Update Plan Status
  IF now() < v_scheduled_at THEN
    -- Early completion
    v_scheduled_at := now();
    -- rsvp_deadline must not be after scheduled_at
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      scheduled_at = v_scheduled_at,
      rsvp_deadline = v_rsvp_deadline,
      updated_at = now()
  WHERE id = p_plan_id;

  -- Note: Wallet recalculations are intentionally skipped to preserve existing
  -- financial obligations or replaced expenses consistently.

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'COMPLETED',
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_plan(UUID, JSONB) TO authenticated;
