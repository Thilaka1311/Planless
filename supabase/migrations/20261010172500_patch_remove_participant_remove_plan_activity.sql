-- Migration: Patch remove_participant RPC to remove dormant plan_activity update
-- Reason: plan_activity was disabled in migration 20260907160000; removing residual UPDATE block
-- completely decouples the participant state machine from plan_activity.

CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_plan_size              INT;
  v_promoted_count         INT := 0;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  -- Safely lock plan record to coordinate concurrent changes
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status, assigned_group, COALESCE(leave_requested, FALSE)
    INTO v_target_role, v_target_status, v_target_assigned_group, v_target_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot remove the last active host
  IF v_target_role = 'HOST'::participant_role AND v_target_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Host-initiated removal always sets canonical skip_reason 'REMOVED'
  v_skip_reason := 'REMOVED'::skip_reason;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant:
  -- Update removed participant to SKIPPED with skip_reason = 'REMOVED'.
  -- Clear their assigned group, waitlist position, and queue metadata.
  -- Do NOT delete their participant record.
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = v_skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         joined_queue_at    = NULL,
         role               = 'PARTICIPANT'::participant_role,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         responded_at       = now(),
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- Ensure invited_participants count on plans is accurate (excludes SKIPPED)
  UPDATE public.plans
     SET invited_participants = (
       SELECT COUNT(*)
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND rsvp_status != 'SKIPPED'::rsvp_status
     ),
     updated_at = now()
   WHERE id = p_plan_id;

  -- Trigger appropriate waitlist promotion path
  IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    IF v_plan_size IS NOT NULL AND v_target_status = 'JOINED'::rsvp_status THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
    IF v_target_assigned_group IS NOT NULL THEN
      v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'skip_reason',      v_skip_reason,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$$;

ALTER FUNCTION public.remove_participant(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO service_role;
