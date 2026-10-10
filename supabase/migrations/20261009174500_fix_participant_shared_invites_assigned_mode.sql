-- Migration: 20261009174500_fix_participant_shared_invites_assigned_mode.sql
-- Description:
-- When host enables allow_participant_invites in Assigned mode (participant_filtering = 'ASSIGNED'):
-- 1. Anyone opening a shared plan link (claim_plan_invite) who is not already a participant:
--    - rsvp_status = 'INVITED'
--    - assigned_group = 'WAITLIST'::assigned_group_enum
--    - waitlist_position = NULL
--    - joined_queue_at = NULL
--    - plan_size remains unchanged
-- 2. When allow_participant_invites is FALSE or in Automatic mode:
--    - assigned_group = NULL
-- 3. In invite_participants RPC, when called by PARTICIPANT in Assigned mode:
--    - assigned_group = 'WAITLIST'::assigned_group_enum (participants cannot assign invitees to GOING)
-- 4. In all cases, existing participants (HOST, JOINED, WAITLISTED, SKIPPED, INVITED) have state preserved.

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
  v_assigned_group        assigned_group_enum := NULL;
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
  SELECT id, status, plan_size, invited_participants, participant_filtering, allow_participant_invites
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
  -- When participant invitations are enabled AND the plan is in Assigned mode:
  --   Set assigned_group := 'WAITLIST'::assigned_group_enum
  -- In Automatic mode (or when participant invitations are not enabled):
  --   Set assigned_group := NULL
  -- In ALL modes:
  --   Set rsvp_status := 'INVITED'::rsvp_status
  --   Keep waitlist_position := NULL
  --   Keep joined_queue_at := NULL
  --   Keep plan_size unchanged
  IF v_plan_record.participant_filtering = 'ASSIGNED'::participant_filtering_type
     AND COALESCE(v_plan_record.allow_participant_invites, false) = true THEN
    v_assigned_group := 'WAITLIST'::assigned_group_enum;
  ELSE
    v_assigned_group := NULL;
  END IF;

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
    v_assigned_group,
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
    'assigned_group', v_assigned_group::text,
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


-- Update invite_participants RPC so participant-invited guests in Assigned mode are always assigned to WAITLIST
CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id uuid,
  p_invitee_user_ids uuid[],
  p_assigned_group assigned_group_enum DEFAULT NULL::assigned_group_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_current_plan_size INT;
  v_current_invited INT;
BEGIN
  -- 1. Identify authenticated user from JWT context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch caller's role in the plan
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 3. Fetch plan settings & filtering mode, locking row
  SELECT allow_participant_invites, participant_filtering,
         plan_size,
         COALESCE(invited_participants, 0)
    INTO v_allow_participant_invites, v_filtering,
         v_current_plan_size, v_current_invited
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Ensure v_current_invited accurately reflects current active participants
  SELECT COUNT(*)
    INTO v_current_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- 4. Authorization Check
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  -- Determine effective assigned_group:
  -- In Automatic mode: always NULL
  -- In Assigned mode:
  --   If called by a PARTICIPANT: always 'WAITLIST' (participants cannot assign to GOING)
  --   If called by a HOST: respect p_assigned_group, defaulting to 'GOING'
  IF v_filtering IS NULL OR v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role THEN
    v_target_assigned_group := 'WAITLIST'::assigned_group_enum;
  ELSE
    v_target_assigned_group := COALESCE(p_assigned_group, 'GOING'::assigned_group_enum);
  END IF;

  -- 5. Process invitees in a single atomic loop
  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if participant record already exists
      SELECT rsvp_status
        INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id
         FOR UPDATE;

      IF FOUND THEN
        IF v_existing_status = 'SKIPPED'::rsvp_status THEN
          -- Reactivation (SKIPPED -> active INVITED)
          v_current_invited := v_current_invited + 1;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 responded_at = NULL,
                 skip_reason = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        END IF;
      ELSE
        -- Insert new participant record as INVITED
        v_current_invited := v_current_invited + 1;

        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          assigned_group,
          joined_queue_at,
          waitlist_position,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          NULL,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Persist invited_participants only (plan_size remains unchanged)
  UPDATE public.plans
     SET invited_participants = v_current_invited,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'assigned_group',       v_target_assigned_group::text,
    'invited_participants', v_current_invited
  );
END;
$$;

ALTER FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) OWNER TO postgres;

GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO authenticated, service_role;
