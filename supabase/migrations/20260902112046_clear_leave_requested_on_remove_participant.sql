-- 1. Update remove_participant to clear leave_requested and leave_requested_at
CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id             UUID;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
  v_target_assigned_group assigned_group_enum;
  v_filtering_mode        participant_filtering_type;
  v_max_participants      INT;
  v_promoted_count        INT := 0;
  v_remaining_hosts       INT;
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
  SELECT role, rsvp_status, assigned_group 
    INTO v_target_role, v_target_status, v_target_assigned_group
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

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant
  UPDATE public.plan_participants
     SET rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'REMOVED'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         role              = 'PARTICIPANT'::participant_role,
         leave_requested   = FALSE,
         leave_requested_at= NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

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
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;

-- 2. Data cleanup: Clear stale leave_requested flags on any already SKIPPED participants
UPDATE public.plan_participants
   SET leave_requested = FALSE,
       leave_requested_at = NULL
 WHERE rsvp_status = 'SKIPPED'
   AND leave_requested = TRUE;
