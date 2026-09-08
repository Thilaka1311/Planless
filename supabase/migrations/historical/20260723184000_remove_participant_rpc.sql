-- ============================================================================
-- Migration: Create remove_participant SECURITY DEFINER RPC & update RLS
-- Description: Allows Creator Host or Additional Hosts (role IN ('HOST', 'CO_HOST'))
--              to remove any non-creator participant from a plan.
--              Sets rsvp_status = 'SKIPPED' and skip_reason = 'REMOVED'.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_participant(
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
  v_creator_id         UUID;
  v_caller_role        participant_role;
  v_caller_status      rsvp_status;
  v_is_host            BOOLEAN := FALSE;
  v_target_status      rsvp_status;
  v_filtering_mode     participant_filtering_type;
  v_joined_count       INT := 0;
  v_max_participants   INT;
  v_promoted_user_id   UUID := NULL;
  v_waitlist_rec       RECORD;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch plan attributes
  SELECT host_id, max_participants, participant_filtering
    INTO v_creator_id, v_max_participants, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Check caller host permissions (Creator Host or Additional Host)
  IF v_caller_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  -- 4. Creator Host cannot be removed by anyone
  IF p_target_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot remove the Creator Host' USING ERRCODE = '40300';
  END IF;

  -- 5. Fetch target participant record
  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  -- If already SKIPPED with REMOVED, return success early
  IF v_target_status = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_removed', true
    );
  END IF;

  -- 6. Perform removal under system privilege
  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.plan_participants
     SET rsvp_status  = 'SKIPPED'::rsvp_status,
         skip_reason  = 'REMOVED'::skip_reason,
         role         = 'PARTICIPANT'::participant_role,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 7. If target was in JOINED and plan uses AUTOMATIC filtering, auto-promote waitlisted participant
  IF v_target_status = 'JOINED'::rsvp_status AND v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_max_participants IS NOT NULL AND v_joined_count < v_max_participants THEN
      SELECT user_id INTO v_waitlist_rec
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'::rsvp_status
       ORDER BY created_at ASC, responded_at ASC
       LIMIT 1;

      IF FOUND THEN
        UPDATE public.plan_participants
           SET rsvp_status  = 'JOINED'::rsvp_status,
               skip_reason  = NULL,
               responded_at = now(),
               updated_at   = now()
         WHERE plan_id = p_plan_id AND user_id = v_waitlist_rec.user_id;
        v_promoted_user_id := v_waitlist_rec.user_id;
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  -- 8. Return response
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id,
    'promoted_user_id', v_promoted_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;
