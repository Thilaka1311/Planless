-- Migration: 20260917193500_rethink_participant_management_flow.sql
-- Description: Unify and cleanly separate Join Capacity (plan_size) vs. Invited Roster
--   1. Update invite_participants: Stop auto-incrementing plan_size when invited count equals plan_size.
--      Always invite users as rsvp_status = 'INVITED'.
--   2. Create join_plan(p_plan_id uuid): Atomic join RPC for both Automatic (FCFS timestamp) and Assigned modes.
--   3. Update claim_plan_invite(p_plan_id uuid): Align invite-link claiming with atomic join logic.
--   4. Ensure update_plan_capacity protects active host spots and correctly handles demotions/promotions.

-- ============================================================================
-- 1. INVITE_PARTICIPANTS (Decouple plan_size from invited_participants)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id uuid,
  p_invitee_user_ids uuid[],
  p_assigned_group assigned_group_enum DEFAULT NULL::assigned_group_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
         COALESCE(plan_size, 10),
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

  -- Determine effective assigned_group (NULL if AUTOMATIC)
  IF v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
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
          -- plan_size is NEVER modified by inviting someone
          v_current_invited := v_current_invited + 1;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 responded_at = NULL,
                 joined_queue_at = NULL,
                 waitlist_position = NULL,
                 skip_reason = NULL,
                 leave_requested = FALSE,
                 leave_requested_at = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        ELSE
          -- Duplicate invitation of already active participant: no-op
          CONTINUE;
        END IF;
      ELSE
        -- Genuinely new participant added as INVITED
        -- plan_size is NEVER modified by inviting someone
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
    'total_invited_count',  v_current_invited,
    'invited_participants', v_current_invited,
    'plan_size',            v_current_plan_size
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO service_role;

-- ============================================================================
-- 2. ATOMIC JOIN_PLAN RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_plan_record              RECORD;
  v_existing                 RECORD;
  v_joined_count             INT;
  v_new_status               rsvp_status;
  v_new_group                assigned_group_enum;
  v_next_pos                 INT;
  v_was_system_op            TEXT;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Lock plan row
  SELECT id, status, plan_size, participant_filtering
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

  -- 3. Lock target participant row if exists
  SELECT role, rsvp_status, assigned_group, waitlist_position
    INTO v_existing
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  -- 4. Count current JOINED participants
  SELECT COUNT(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status = 'JOINED'::rsvp_status;

  -- 5. Idempotent check: if already JOINED or WAITLISTED
  IF FOUND THEN
    IF v_existing.rsvp_status = 'JOINED'::rsvp_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'rsvp_status', 'JOINED',
        'assigned_group', v_existing.assigned_group::text,
        'already_participating', true,
        'plan_size', v_plan_record.plan_size
      );
    ELSIF v_existing.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'rsvp_status', 'WAITLISTED',
        'assigned_group', v_existing.assigned_group::text,
        'waitlist_position', v_existing.waitlist_position,
        'already_participating', true,
        'plan_size', v_plan_record.plan_size
      );
    ELSIF v_existing.rsvp_status = 'SKIPPED'::rsvp_status THEN
      RAISE EXCEPTION 'Participant has left or declined this plan. Please request to rejoin.' USING ERRCODE = '40000';
    END IF;
  END IF;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- 6. State determination
  IF v_plan_record.participant_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    IF v_joined_count < COALESCE(v_plan_record.plan_size, 10) THEN
      v_new_status := 'JOINED'::rsvp_status;
    ELSE
      v_new_status := 'WAITLISTED'::rsvp_status;
    END IF;

    IF FOUND THEN
      UPDATE public.plan_participants
         SET rsvp_status       = v_new_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             joined_queue_at   = now(),
             responded_at      = now(),
             skip_reason       = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = v_user_id;
    ELSE
      INSERT INTO public.plan_participants (
        plan_id, user_id, role, rsvp_status, assigned_group,
        waitlist_position, joined_queue_at, responded_at
      ) VALUES (
        p_plan_id, v_user_id, 'PARTICIPANT'::participant_role, v_new_status, NULL,
        NULL, now(), now()
      );
    END IF;

  ELSE
    -- ASSIGNED mode
    IF FOUND THEN
      -- Existing row: respect assigned_group if set
      IF v_existing.assigned_group = 'WAITLIST'::assigned_group_enum THEN
        v_new_status := 'WAITLISTED'::rsvp_status;
        v_new_group  := 'WAITLIST'::assigned_group_enum;
      ELSIF v_existing.assigned_group = 'GOING'::assigned_group_enum THEN
        v_new_status := 'JOINED'::rsvp_status;
        v_new_group  := 'GOING'::assigned_group_enum;
      ELSE
        -- Fallback if assigned_group was NULL
        IF v_joined_count < COALESCE(v_plan_record.plan_size, 10) THEN
          v_new_status := 'JOINED'::rsvp_status;
          v_new_group  := 'GOING'::assigned_group_enum;
        ELSE
          v_new_status := 'WAITLISTED'::rsvp_status;
          v_new_group  := 'WAITLIST'::assigned_group_enum;
        END IF;
      END IF;

      -- If becoming WAITLIST and lacks waitlist_position, assign next position
      IF v_new_group = 'WAITLIST'::assigned_group_enum AND v_existing.waitlist_position IS NULL THEN
        SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'::assigned_group_enum;
      ELSE
        v_next_pos := v_existing.waitlist_position;
      END IF;

      UPDATE public.plan_participants
         SET rsvp_status       = v_new_status,
             assigned_group    = v_new_group,
             waitlist_position = CASE WHEN v_new_group = 'WAITLIST'::assigned_group_enum THEN v_next_pos ELSE NULL END,
             joined_queue_at   = NULL,
             responded_at      = now(),
             skip_reason       = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = v_user_id;

    ELSE
      -- New participant joining via link in ASSIGNED mode
      IF v_joined_count < COALESCE(v_plan_record.plan_size, 10) THEN
        v_new_status := 'JOINED'::rsvp_status;
        v_new_group  := 'GOING'::assigned_group_enum;
        v_next_pos   := NULL;
      ELSE
        v_new_status := 'WAITLISTED'::rsvp_status;
        v_new_group  := 'WAITLIST'::assigned_group_enum;
        SELECT COALESCE(MAX(waitlist_position), 0) + 1 INTO v_next_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'::assigned_group_enum;
      END IF;

      INSERT INTO public.plan_participants (
        plan_id, user_id, role, rsvp_status, assigned_group,
        waitlist_position, joined_queue_at, responded_at
      ) VALUES (
        p_plan_id, v_user_id, 'PARTICIPANT'::participant_role, v_new_status, v_new_group,
        v_next_pos, NULL, now()
      );
    END IF;
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'rsvp_status', v_new_status::text,
    'assigned_group', v_new_group::text,
    'waitlist_position', v_next_pos,
    'plan_size', v_plan_record.plan_size
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO service_role;

-- ============================================================================
-- 3. CLAIM_PLAN_INVITE (Reuse atomic join logic, NEVER mutate plan_size)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_plan_invite(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Delegates directly to atomic join_plan
  RETURN public.join_plan(p_plan_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_plan_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_plan_invite(uuid) TO service_role;
