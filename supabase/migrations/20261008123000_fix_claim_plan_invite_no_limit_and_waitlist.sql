-- Migration: 20261008123000_fix_claim_plan_invite_no_limit_and_waitlist.sql
-- Description:
-- 1. Drop obsolete text signature claim_plan_invite(text).
-- 2. Update claim_plan_invite(p_plan_id uuid) with exact contract:
--    - For No Limit plans (plan_size IS NULL):
--        Participant is placed in 'INVITED' state.
--        plan_size remains NULL (unchanged).
--        invited_participants increments by 1.
--    - For Limited plans (plan_size IS NOT NULL):
--        Participant is placed on 'WAITLISTED'.
--        plan_size remains unchanged.
--        waitlist count increments by 1.
--    - In both cases, returns already_participating: false.
--    - If caller already has a row in plan_participants (or is host), returns existing state
--      (JOINED, WAITLISTED, SKIPPED, INVITED) without modifications or duplicate records.

-- 1. Drop obsolete claim_plan_invite taking text
DROP FUNCTION IF EXISTS public.claim_plan_invite(text);

-- 2. Create/replace claim_plan_invite taking uuid
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
  v_new_status            rsvp_status;
  v_new_group             assigned_group_enum := NULL;
  v_next_pos              INT := NULL;
  v_queue_at              TIMESTAMPTZ := NULL;
  v_new_plan_size         INT := NULL;
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

  -- 5. Existing participant check (strict idempotency)
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

  -- 6. Participant & Capacity state determination
  IF v_plan_record.plan_size IS NULL THEN
    -- Case 1: No Limit Plan
    -- Participant is 'INVITED' (not joined, not waitlisted).
    -- plan_size remains NULL (unchanged).
    -- invited_participants increments by 1.
    v_new_status    := 'INVITED'::rsvp_status;
    v_new_group     := NULL;
    v_next_pos      := NULL;
    v_queue_at      := NULL;
    v_new_plan_size := NULL;
  ELSE
    -- Case 2: Limited Plan
    -- Participant is automatically placed on 'WAITLISTED' (not joined).
    -- plan_size remains unchanged.
    -- joined count unchanged.
    -- waitlist count increments by 1.
    v_new_status    := 'WAITLISTED'::rsvp_status;
    v_new_plan_size := v_plan_record.plan_size;

    IF v_plan_record.participant_filtering = 'AUTOMATIC'::participant_filtering_type THEN
      v_new_group := NULL;
      v_next_pos  := NULL;
      v_queue_at  := now();
    ELSE
      -- ASSIGNED mode
      v_new_group := 'WAITLIST'::assigned_group_enum;
      SELECT COALESCE(MAX(waitlist_position), 0) + 1
        INTO v_next_pos
        FROM public.plan_participants
       WHERE plan_id = v_plan_record.id
         AND assigned_group = 'WAITLIST'::assigned_group_enum;
      v_queue_at  := NULL;
    END IF;
  END IF;

  v_new_invited := COALESCE(v_plan_record.invited_participants, 0) + 1;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

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
    joined_queue_at,
    responded_at,
    delivery_status
  ) VALUES (
    v_plan_record.id,
    v_caller_id,
    'PARTICIPANT'::participant_role,
    v_new_status,
    v_new_group,
    v_next_pos,
    v_queue_at,
    CASE WHEN v_new_status = 'WAITLISTED' THEN now() ELSE NULL END,
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
    'rsvp_status', v_new_status::text,
    'assigned_group', v_new_group::text,
    'waitlist_position', v_next_pos,
    'already_participating', false,
    'plan_size', v_new_plan_size,
    'invited_participants', v_new_invited
  );
END;
$$;

ALTER FUNCTION public.claim_plan_invite(p_plan_id uuid) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(p_plan_id uuid) TO service_role;
