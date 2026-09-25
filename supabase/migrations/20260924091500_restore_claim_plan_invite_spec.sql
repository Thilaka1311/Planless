-- Migration: 20260924091500_restore_claim_plan_invite_spec.sql
-- Description: Implement claim_plan_invite strictly according to invite_link.md:
--              1. Adds new claimant as role = 'PARTICIPANT', rsvp_status = 'INVITED' (or WAITLISTED if ASSIGNED full)
--              2. Increments plans.invited_participants and dynamically increments plan_size if capacity matches invited
--              3. Strictly idempotent for existing participants
--              4. Prevents host from claiming own plan

CREATE OR REPLACE FUNCTION public.claim_plan_invite(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_plan_record              RECORD;
  v_existing_participant     RECORD;
  v_filtering                TEXT;
  v_plan_size                INT;
  v_invited_count            INT;
  v_joined_count             INT;
  v_new_plan_size            INT;
  v_new_invited              INT;
  v_was_system_op            TEXT;
  v_result_rsvp              TEXT;
  v_result_assigned_group    TEXT;
  v_result_waitlist_position INT;
  v_result_plan_size         INT;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Validate plan ID input
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'Invalid plan ID' USING ERRCODE = '40400';
  END IF;

  -- 3. Look up referenced plan with row lock
  SELECT id, status, invited_participants, plan_size, participant_filtering, waitlist_order_mode
    INTO v_plan_record
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Plan status check: link is valid ONLY while plan is LIVE
  IF v_plan_record.status <> 'LIVE'::plan_status THEN
    RAISE EXCEPTION 'Plan is not active' USING ERRCODE = '40000';
  END IF;

  -- 5. Host check: host cannot claim invite for their own plan
  IF public.is_plan_host(p_plan_id, v_user_id) OR EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = v_user_id
       AND role = 'HOST'::participant_role
  ) THEN
    RAISE EXCEPTION 'Host cannot claim invite for their own plan' USING ERRCODE = '40000';
  END IF;

  -- 6. Check if caller already has a participant record
  SELECT role, rsvp_status, assigned_group, waitlist_position
    INTO v_existing_participant
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND user_id = v_user_id;

  IF FOUND THEN
    -- Idempotency: Retain existing state (JOINED, WAITLISTED, SKIPPED, INVITED)
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', v_existing_participant.rsvp_status::text,
      'assigned_group', v_existing_participant.assigned_group::text,
      'waitlist_position', v_existing_participant.waitlist_position,
      'already_participating', true,
      'plan_size', v_plan_record.plan_size,
      'invited_participants', v_plan_record.invited_participants
    );
  END IF;

  -- 7. Derive current plan parameters and participant counts
  v_plan_size := COALESCE(v_plan_record.plan_size, 10);
  v_filtering := COALESCE(v_plan_record.participant_filtering::TEXT, 'AUTOMATIC');

  -- Count total non-skipped invited participants
  SELECT COUNT(*)
    INTO v_invited_count
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- Count current JOINED participants
  SELECT COUNT(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status = 'JOINED'::rsvp_status;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- 8. State machine execution based on plan_size vs invited_count and filtering mode
  IF v_plan_size >= v_invited_count THEN
    -- Case A: Capacity available -> User becomes INVITED
    IF v_plan_size = v_invited_count THEN
      v_new_plan_size := v_plan_size + 1;
    ELSE
      v_new_plan_size := v_plan_size;
    END IF;

    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET plan_size = v_new_plan_size,
           invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    -- Insert participant as INVITED
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      responded_at,
      skip_reason,
      delivery_status
    ) VALUES (
      v_plan_record.id,
      v_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      NULL,
      NULL,
      NULL,
      NULL,
      'DELIVERED'
    );

    v_result_rsvp := 'INVITED';
    v_result_assigned_group := NULL;
    v_result_waitlist_position := NULL;
    v_result_plan_size := v_new_plan_size;

  ELSIF v_filtering = 'ASSIGNED' THEN
    -- Case B: Full capacity in ASSIGNED mode -> User becomes WAITLISTED
    v_new_plan_size := v_plan_size;
    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      responded_at,
      skip_reason,
      delivery_status
    ) VALUES (
      v_plan_record.id,
      v_user_id,
      'PARTICIPANT'::participant_role,
      'WAITLISTED'::rsvp_status,
      'WAITLIST'::assigned_group_enum,
      NULL,
      NULL,
      NULL,
      'DELIVERED'
    );

    PERFORM public.rebuild_waitlist_queue(v_plan_record.id);

    SELECT waitlist_position
      INTO v_result_waitlist_position
      FROM public.plan_participants
     WHERE plan_id = v_plan_record.id
       AND user_id = v_user_id;

    v_result_rsvp := 'WAITLISTED';
    v_result_assigned_group := 'WAITLIST';
    v_result_plan_size := v_plan_size;

  ELSE
    -- Case C: AUTOMATIC mode with full invited count -> increments capacity & invites as INVITED
    v_new_plan_size := v_plan_size + 1;
    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET plan_size = v_new_plan_size,
           invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      responded_at,
      skip_reason,
      delivery_status
    ) VALUES (
      v_plan_record.id,
      v_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      NULL,
      NULL,
      NULL,
      NULL,
      'DELIVERED'
    );

    v_result_rsvp := 'INVITED';
    v_result_assigned_group := NULL;
    v_result_waitlist_position := NULL;
    v_result_plan_size := v_new_plan_size;
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', v_result_rsvp,
    'assigned_group', v_result_assigned_group,
    'waitlist_position', v_result_waitlist_position,
    'already_participating', false,
    'plan_size', COALESCE(v_result_plan_size, v_plan_size),
    'invited_participants', v_new_invited
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_plan_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(uuid) TO service_role;
