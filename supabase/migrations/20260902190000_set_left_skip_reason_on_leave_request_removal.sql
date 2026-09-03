-- ============================================================
-- Migration: Fix Leave-Request Removal to use 'LEFT' skip_reason
--
-- Distinction:
-- 1. Voluntary Leave / Approved Leave Request (leave_requested = TRUE) -> skip_reason = 'LEFT'
-- 2. Direct Host-Initiated Removal (leave_requested = FALSE) -> skip_reason = 'REMOVED'
--
-- In both cases, leave_requested is cleared to FALSE and leave_requested_at to NULL.
-- ============================================================

CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_max_participants       INT;
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

  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

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

  -- Determine skip_reason:
  -- If participant requested to leave (leave_requested = TRUE), skip_reason is 'LEFT' (voluntary leave).
  -- Otherwise, it is a host-initiated removal, so skip_reason is 'REMOVED'.
  IF v_target_leave_requested = TRUE THEN
    v_skip_reason := 'LEFT'::skip_reason;
  ELSE
    v_skip_reason := 'REMOVED'::skip_reason;
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant
  UPDATE public.plan_participants
     SET rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = v_skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         role              = 'PARTICIPANT'::participant_role,
         leave_requested   = FALSE,
         leave_requested_at= NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- If this was a leave request, resolve the pending activity if present
  IF v_target_leave_requested = TRUE THEN
    UPDATE public.plan_activity
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"RESOLVED"')
     WHERE plan_id = p_plan_id
       AND target_user_id = p_target_user_id
       AND activity_type = 'participant_left'::plan_activity_type
       AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING');
  END IF;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      IF v_target_status = 'JOINED'::rsvp_status THEN
        v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
      END IF;
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
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
$function$;

GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;
