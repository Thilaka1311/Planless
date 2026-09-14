-- Migration: 20260914084041_refactor_invite_by_link_remove_plan_invites.sql
-- Description: Refactors Invite by Link to remove public.plan_invites table entirely.
--              The plan UUID itself acts as the invite token.
--              When a new participant claims an invite for a LIVE plan, plan capacity
--              (plan_size) is atomically incremented by 1, and max_participants is
--              maintained in compliance with plan invariants.
--              Existing participant states (JOINED, WAITLISTED, SKIPPED, INVITED) are preserved.
--              Hosts cannot claim invites for their own plans.

-- 1. Drop old claim_plan_invite function taking (text)
DROP FUNCTION IF EXISTS "public"."claim_plan_invite"("p_invite_token" "text");

-- 2. Create new claim_plan_invite taking (uuid)
CREATE OR REPLACE FUNCTION "public"."claim_plan_invite"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id              UUID;
  v_plan_record          RECORD;
  v_existing_participant RECORD;
  v_total_invited        INT;
  v_new_plan_size        INT;
  v_new_max_participants INT;
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

  -- 3. Look up referenced plan with row lock for atomic capacity update
  SELECT id, status, max_participants, plan_size
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

  -- 5. Host check: host cannot claim their own plan invite
  IF public.is_plan_host(p_plan_id, v_user_id) OR EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = v_user_id
       AND role = 'HOST'::participant_role
  ) THEN
    RAISE EXCEPTION 'Host cannot claim invite for their own plan' USING ERRCODE = '40000';
  END IF;

  -- 6. Check if caller already has a participant record
  SELECT role, rsvp_status
    INTO v_existing_participant
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND user_id = v_user_id;

  IF FOUND THEN
    -- Idempotency: Retain existing state (JOINED, WAITLISTED, SKIPPED, INVITED)
    -- Do NOT increase capacity for existing participants or repeated claims
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', v_existing_participant.rsvp_status::text,
      'already_participating', true,
      'plan_size', COALESCE(v_plan_record.plan_size, v_plan_record.max_participants)
    );
  END IF;

  -- 7. Insert new participant as INVITED
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

  -- 8. Capacity behavior: Atomically increase plan capacity (plan_size) by 1
  --    for new participants created through an invite link.
  v_new_plan_size := COALESCE(v_plan_record.plan_size, v_plan_record.max_participants, 10) + 1;

  -- Count total non-skipped invited participants
  SELECT COUNT(*)
    INTO v_total_invited
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- Maintain check_plan_size_bounds (plan_size <= max_participants)
  -- and invariant (max_participants >= total_invited)
  v_new_max_participants := GREATEST(
    COALESCE(v_plan_record.max_participants, v_new_plan_size),
    v_new_plan_size,
    v_total_invited
  );

  UPDATE public.plans
     SET plan_size = v_new_plan_size,
         max_participants = v_new_max_participants,
         updated_at = now()
   WHERE id = v_plan_record.id;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', 'INVITED',
    'already_participating', false,
    'new_plan_size', v_new_plan_size
  );
END;
$$;

ALTER FUNCTION "public"."claim_plan_invite"("p_plan_id" "uuid") OWNER TO "postgres";

REVOKE EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_plan_id" "uuid") FROM "public", "anon";
GRANT EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_plan_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_plan_invite"("p_plan_id" "uuid") TO "service_role";

-- 3. Drop obsolete plan_invites table and all associated policies/indexes
DROP TABLE IF EXISTS "public"."plan_invites" CASCADE;
