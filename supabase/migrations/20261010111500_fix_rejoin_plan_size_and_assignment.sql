-- Migration: 20261010111500_fix_rejoin_plan_size_and_assignment.sql
-- Description:
--   Updates public.resolve_rejoined_participant so that:
--   1. In Assigned mode when decision is 'JOINED' (Add to Joined):
--      - Increases plan_size by 1 to account for the participant rejoining
--      - Sets rsvp_status = 'JOINED' and assigned_group = 'GOING'
--      - Clears skip_reason, waitlist_position, joined_queue_at, leave_requested
--      - Recalculates wallet expenses / cost share
--   2. In Assigned mode when decision is 'WAITLIST' or 'WAITLISTED' (Add to Waitlist):
--      - Keeps plan_size unchanged
--      - Sets rsvp_status = 'WAITLISTED' and assigned_group = 'WAITLIST'
--      - Assigns next sequential waitlist_position (max_pos + 1)
--      - Clears skip_reason, leave_requested
--   3. Preserves existing behavior outside this rejoin flow (e.g. Automatic mode).

CREATE OR REPLACE FUNCTION public.resolve_rejoined_participant(
  p_plan_id uuid,
  p_target_user_id uuid,
  p_decision text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id             UUID;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
  v_filtering_mode        participant_filtering_type;
  v_plan_size             INT;
  v_new_plan_size         INT;
  v_max_pos               INT;
  v_decision              TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL AND auth.role() <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host (or service_role / postgres)
  IF v_caller_id IS NOT NULL AND auth.role() <> 'service_role' AND current_user <> 'postgres' THEN
    IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
      RAISE EXCEPTION 'Unauthorized: Only active hosts can resolve rejoin requests' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Lock and inspect plan
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  v_new_plan_size := v_plan_size;

  -- Lock and inspect target participant
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  IF v_target_status NOT IN ('REJOINED'::rsvp_status, 'SKIPPED'::rsvp_status) THEN
    RAISE EXCEPTION 'Participant is not in REJOINED or SKIPPED status' USING ERRCODE = '40000';
  END IF;

  v_decision := UPPER(TRIM(p_decision));

  PERFORM set_config('app.system_op', 'true', true);

  IF v_decision = 'JOINED' THEN
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      -- In Assigned mode: Increase plan_size by 1 to account for the participant rejoining
      IF v_plan_size IS NOT NULL THEN
        UPDATE public.plans
           SET plan_size  = plan_size + 1,
               updated_at = now()
         WHERE id = p_plan_id
        RETURNING plan_size INTO v_new_plan_size;
      END IF;

      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = 'GOING'::assigned_group_enum,
             waitlist_position = NULL,
             joined_queue_at   = NULL,
             skip_reason       = NULL,
             leave_requested   = FALSE,
             leave_requested_at= NULL,
             responded_at      = COALESCE(responded_at, now()),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      -- Recalculate wallet expenses if plan total cost exists
      PERFORM public.recalculate_wallet_expenses(p_plan_id);
    ELSE
      -- In Automatic mode: preserve existing behavior outside this rejoin flow
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             joined_queue_at   = NULL,
             skip_reason       = NULL,
             leave_requested   = FALSE,
             leave_requested_at= NULL,
             responded_at      = COALESCE(responded_at, now()),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'WAITLIST' OR v_decision = 'WAITLISTED' THEN
    -- Keep plan_size unchanged because the participant has not joined
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      SELECT COALESCE(MAX(waitlist_position), 0)
        INTO v_max_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND user_id <> p_target_user_id;

      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = 'WAITLIST'::assigned_group_enum,
             waitlist_position = v_max_pos + 1,
             joined_queue_at   = COALESCE(joined_queue_at, now()),
             skip_reason       = NULL,
             leave_requested   = FALSE,
             leave_requested_at= NULL,
             responded_at      = COALESCE(responded_at, now()),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    ELSE
      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             joined_queue_at   = now(),
             skip_reason       = NULL,
             leave_requested   = FALSE,
             leave_requested_at= NULL,
             responded_at      = COALESCE(responded_at, now()),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'REMOVE' THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  ELSE
    PERFORM set_config('app.system_op', 'false', true);
    RAISE EXCEPTION 'Invalid decision: % (must be JOINED, WAITLISTED, or REMOVE)', p_decision USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',   true,
    'plan_id',   p_plan_id,
    'user_id',   p_target_user_id,
    'decision',  v_decision,
    'plan_size', v_new_plan_size
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_rejoined_participant(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_rejoined_participant(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_rejoined_participant(uuid, uuid, text) TO anon;
