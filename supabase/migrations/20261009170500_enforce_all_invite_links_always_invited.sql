-- Migration: 20261009170500_enforce_all_invite_links_always_invited.sql
-- Description:
-- Update public.claim_plan_invite(p_plan_id uuid) to ensure that ANY recipient opening a shared link
-- who is not already a participant is placed in the 'INVITED' state.
-- Opening a link is strictly an invitation action, never an attendance decision.
-- No user is ever automatically placed into 'JOINED' or 'WAITLISTED', regardless of capacity or waitlists.
-- Waitlist position and joined queue timestamps remain NULL.
-- Existing participants (HOST, JOINED, WAITLISTED, SKIPPED, INVITED) have their state preserved.

CREATE OR REPLACE FUNCTION public.claim_plan_invite(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id             UUID;
  v_plan_record           RECORD;
  v_existing_participant  RECORD;
  v_new_invited           INT;
  v_was_system_op         TEXT;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Validate input plan ID
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'Invalid plan ID' USING ERRCODE = '40400';
  END IF;

  -- 3. Lock plan row FOR UPDATE
  SELECT id, status, plan_size, invited_participants, participant_filtering
    INTO v_plan_record
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_plan_record.status <> 'LIVE'::plan_status THEN
    RAISE EXCEPTION 'Plan is not active' USING ERRCODE = '40000';
  END IF;

  -- 4. Host check: host cannot claim invite for their own plan
  IF public.is_plan_host(p_plan_id, v_caller_id) OR EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = v_caller_id
       AND role = 'HOST'::participant_role
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', 'JOINED',
      'role', 'HOST',
      'assigned_group', null,
      'waitlist_position', null,
      'already_participating', true,
      'plan_size', v_plan_record.plan_size,
      'invited_participants', v_plan_record.invited_participants
    );
  END IF;

  -- 5. Existing participant check (strict idempotency for all existing states)
  SELECT role, rsvp_status, assigned_group, waitlist_position
    INTO v_existing_participant
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND user_id = v_caller_id;

  IF v_existing_participant.role IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', v_existing_participant.rsvp_status::text,
      'role', v_existing_participant.role::text,
      'assigned_group', v_existing_participant.assigned_group::text,
      'waitlist_position', v_existing_participant.waitlist_position,
      'already_participating', true,
      'plan_size', v_plan_record.plan_size,
      'invited_participants', v_plan_record.invited_participants
    );
  END IF;

  -- 6. Participant & Capacity state determination:
  -- Any recipient not already part of the plan is placed in the INVITED state.
  -- Opening a shared link never automatically moves someone into JOINED or WAITLISTED,
  -- regardless of participant limits, available capacity, or active waitlists.
  -- plan_size is never changed by an invitation.
  v_new_invited := COALESCE(v_plan_record.invited_participants, 0) + 1;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

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
    joined_queue_at,
    responded_at,
    delivery_status
  ) VALUES (
    v_plan_record.id,
    v_caller_id,
    'PARTICIPANT'::participant_role,
    'INVITED'::rsvp_status,
    NULL,
    NULL,
    NULL,
    NULL,
    'DELIVERED'
  );

  IF v_was_system_op IS NULL OR v_was_system_op = '' THEN
    PERFORM set_config('app.system_op', 'false', true);
  ELSE
    PERFORM set_config('app.system_op', v_was_system_op, true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', 'INVITED',
    'role', 'PARTICIPANT',
    'assigned_group', null,
    'waitlist_position', null,
    'already_participating', false,
    'plan_size', v_plan_record.plan_size,
    'invited_participants', v_new_invited
  );
END;
$$;

ALTER FUNCTION public.claim_plan_invite(p_plan_id uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) TO service_role;
