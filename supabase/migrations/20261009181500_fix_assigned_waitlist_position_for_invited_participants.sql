-- Migration: 20261009181500_fix_assigned_waitlist_position_for_invited_participants.sql
-- Description:
-- Fix missing waitlist numbers for participants added in Assigned mode.
-- 1. In claim_plan_invite: When assigned_group is WAITLIST, assign next sequential waitlist_position.
-- 2. In invite_participants: When target assigned_group is WAITLIST, assign next sequential waitlist_position.
-- 3. Backfill existing Assigned waitlist rows where waitlist_position IS NULL.

-- 1. Backfill existing Assigned waitlist participants who have NULL waitlist_position
WITH ranked_missing AS (
  SELECT
    pp.plan_id,
    pp.user_id,
    COALESCE(m.max_pos, 0) + ROW_NUMBER() OVER (
      PARTITION BY pp.plan_id
      ORDER BY pp.created_at ASC, pp.user_id ASC
    ) AS calculated_pos
  FROM public.plan_participants pp
  JOIN public.plans p ON p.id = pp.plan_id
  LEFT JOIN (
    SELECT plan_id, MAX(waitlist_position) AS max_pos
    FROM public.plan_participants
    WHERE assigned_group = 'WAITLIST'::assigned_group_enum
      AND waitlist_position IS NOT NULL
    GROUP BY plan_id
  ) m ON m.plan_id = pp.plan_id
  WHERE pp.assigned_group = 'WAITLIST'::assigned_group_enum
    AND pp.waitlist_position IS NULL
    AND p.participant_filtering = 'ASSIGNED'::participant_filtering_type
)
UPDATE public.plan_participants pp
SET waitlist_position = rm.calculated_pos,
    updated_at = now()
FROM ranked_missing rm
WHERE pp.plan_id = rm.plan_id
  AND pp.user_id = rm.user_id;

-- 2. Update claim_plan_invite RPC
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
  v_next_pos              INT := NULL;
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
  --   Assign next sequential waitlist_position
  -- In Automatic mode (or when participant invitations are not enabled):
  --   Set assigned_group := NULL, waitlist_position := NULL
  -- In ALL modes:
  --   Set rsvp_status := 'INVITED'::rsvp_status
  --   Keep joined_queue_at := NULL
  --   Keep plan_size unchanged
  IF v_plan_record.participant_filtering = 'ASSIGNED'::participant_filtering_type
     AND COALESCE(v_plan_record.allow_participant_invites, false) = true THEN
    v_assigned_group := 'WAITLIST'::assigned_group_enum;
    SELECT COALESCE(MAX(waitlist_position), 0) + 1
      INTO v_next_pos
      FROM public.plan_participants
     WHERE plan_id = v_plan_record.id
       AND assigned_group = 'WAITLIST'::assigned_group_enum;
  ELSE
    v_assigned_group := NULL;
    v_next_pos := NULL;
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
    v_next_pos,
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
    'waitlist_position', v_next_pos,
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


-- 3. Update invite_participants RPC
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
  v_existing_waitlist_pos INT;
  v_participant_exists BOOLEAN;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_current_plan_size INT;
  v_current_invited INT;
  v_next_pos INT;
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
      SELECT rsvp_status, waitlist_position
        INTO v_existing_status, v_existing_waitlist_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id
         FOR UPDATE;

      v_participant_exists := FOUND;

      -- Determine waitlist position if placed into WAITLIST
      IF v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        SELECT COALESCE(MAX(waitlist_position), 0) + 1
          INTO v_next_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum;
      ELSE
        v_next_pos := NULL;
      END IF;

      IF v_participant_exists THEN
        IF v_existing_status = 'SKIPPED'::rsvp_status THEN
          -- Reactivation (SKIPPED -> active INVITED)
          v_current_invited := v_current_invited + 1;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 waitlist_position = CASE
                   WHEN v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
                     COALESCE(waitlist_position, v_next_pos)
                   ELSE NULL
                 END,
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
          v_next_pos,
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
