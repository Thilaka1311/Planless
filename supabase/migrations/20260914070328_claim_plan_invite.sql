-- Migration: 20260914070328_claim_plan_invite.sql
-- Description: Creates the claim_plan_invite RPC allowing authenticated users to claim a shared plan link
--              idempotently as an INVITED participant without altering existing participant states.

CREATE OR REPLACE FUNCTION "public"."claim_plan_invite"("p_invite_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id              UUID;
  v_invite_record        RECORD;
  v_plan_record          RECORD;
  v_existing_participant RECORD;
  v_total_invited        INT;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Validate invite token input
  IF p_invite_token IS NULL OR length(trim(p_invite_token)) = 0 THEN
    RAISE EXCEPTION 'Invalid invite token' USING ERRCODE = '40400';
  END IF;

  -- 3. Look up invite record
  SELECT id, plan_id, is_active
    INTO v_invite_record
    FROM public.plan_invites
   WHERE invite_token = trim(p_invite_token);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite token' USING ERRCODE = '40400';
  END IF;

  IF v_invite_record.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Invite token is no longer active' USING ERRCODE = '40000';
  END IF;

  -- 4. Look up referenced plan
  SELECT id, status, max_participants, plan_size
    INTO v_plan_record
    FROM public.plans
   WHERE id = v_invite_record.plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_plan_record.status <> 'LIVE'::plan_status THEN
    RAISE EXCEPTION 'Plan is not active' USING ERRCODE = '40000';
  END IF;

  -- 5. Check if the authenticated user already has a participant record
  SELECT role, rsvp_status
    INTO v_existing_participant
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id AND user_id = v_user_id;

  IF FOUND THEN
    -- Idempotency: Retain existing state (JOINED, WAITLISTED, SKIPPED, INVITED, HOST)
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', v_existing_participant.rsvp_status::text,
      'already_participating', true
    );
  END IF;

  -- 6. Insert new participant as INVITED
  PERFORM set_config('app.system_op', 'true', true);

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

  -- 7. Maintain max_participants invariant (must be >= total non-skipped invited participants)
  --    Note: plan_size (joined capacity limit) remains completely unaltered.
  SELECT COUNT(*)
    INTO v_total_invited
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  IF v_plan_record.max_participants IS NOT NULL AND v_plan_record.max_participants < v_total_invited THEN
    UPDATE public.plans
       SET max_participants = v_total_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', 'INVITED',
    'already_participating', false
  );
END;
$$;

ALTER FUNCTION "public"."claim_plan_invite"("p_invite_token" "text") OWNER TO "postgres";

REVOKE EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_invite_token" "text") FROM "public", "anon";
GRANT EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_invite_token" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_invite_token" "text") TO "service_role";
