-- Migration: Create manage_completed_plan_participants RPC
-- Description: Authoritative backend operation to add/remove participants after a plan is COMPLETED, keeping costs immutable.

CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(
  p_plan_id UUID,
  p_users_to_add UUID[],
  p_users_to_remove UUID[]
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
  v_target_user_id UUID;
  v_final_count INT;
  v_participant RECORD;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan and host
  SELECT host_id, status
  INTO v_host_id, v_plan_status
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; -- Lock plan row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 3. Process Additions
  IF array_length(p_users_to_add, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_add LOOP
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        final_attendance,
        final_state,
        skip_reason,
        created_at,
        updated_at
      )
      VALUES (
        p_plan_id,
        v_target_user_id,
        'PARTICIPANT'::plan_participant_role,
        'JOINED'::rsvp_status,
        'ATTENDED'::attendance_status,
        'JOINED'::rsvp_status,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE
      SET rsvp_status = 'JOINED'::rsvp_status,
          final_attendance = 'ATTENDED'::attendance_status,
          final_state = 'JOINED'::rsvp_status,
          skip_reason = NULL,
          updated_at = now();
    END LOOP;
  END IF;

  -- 4. Process Removals
  IF array_length(p_users_to_remove, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove LOOP
      -- Fetch current participant record
      SELECT skip_reason INTO v_participant
      FROM public.plan_participants
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id
      FOR UPDATE;
      
      IF FOUND THEN
        UPDATE public.plan_participants
        SET rsvp_status = 'SKIPPED'::rsvp_status,
            final_attendance = 'DID_NOT_ATTEND'::attendance_status,
            final_state = 'SKIPPED'::rsvp_status,
            skip_reason = COALESCE(v_participant.skip_reason, 'REMOVED'),
            updated_at = now()
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
      END IF;
    END LOOP;
  END IF;

  -- 5. Calculate Final Attended Count and Update Plans
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  UPDATE public.plans
  SET max_participants = v_final_count,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'final_count', v_final_count
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(UUID, UUID[], UUID[]) TO authenticated;
