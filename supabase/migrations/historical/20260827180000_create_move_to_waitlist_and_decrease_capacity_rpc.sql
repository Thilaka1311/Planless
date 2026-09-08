-- Migration: Create Security Definer RPC public.move_participant_to_waitlist_and_decrease_capacity
-- Description: Atomically moves a participant to WAITLIST and decreases plan capacity by 1.

CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(
  p_plan_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id          UUID;
  v_host_id            UUID;
  v_current_max        INT;
  v_new_max            INT;
  v_target_row         RECORD;
  v_next_pos           INT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- 1. Identify authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan & host authorization
  SELECT host_id, max_participants
    INTO v_host_id, v_current_max
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
    ) THEN
      RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 3. Lock and verify target participant
  SELECT assigned_group, rsvp_status, role
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
  END IF;

  -- 4. Calculate next waitlist position
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum;

  -- 5. Decrease plan capacity by 1 (minimum capacity is 2)
  v_new_max := GREATEST(2, v_current_max - 1);

  UPDATE public.plans
     SET max_participants = v_new_max,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- 6. Move target participant to waitlist
  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_next_pos,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'plan_id',           p_plan_id,
    'target_user_id',    p_target_user_id,
    'new_capacity',      v_new_max,
    'waitlist_position', v_next_pos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(UUID, UUID) TO authenticated;
