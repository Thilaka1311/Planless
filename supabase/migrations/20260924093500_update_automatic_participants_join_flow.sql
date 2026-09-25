-- Migration: 20260924093500_update_automatic_participants_join_flow.sql
-- Description: Update Automatic Participants flow:
--   1. Re-evaluate capacity every time an Automatic Participant joins.
--   2. If capacity is available -> add participant normally.
--   3. If Plan is full and waitlist exists -> put participant on waitlist.
--   4. The Plan size must remain unchanged when someone is placed on the waitlist.
--   5. Only increase Plan size if: invited participants === current Plan size.
--   6. Status cannot be manually changed; determined strictly by automatic join logic.

-- ============================================================================
-- 1. UPDATE claim_plan_invite
-- ============================================================================
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

  -- 8. State machine execution based on filtering mode and capacity
  IF v_filtering = 'AUTOMATIC' THEN
    -- AUTOMATIC PARTICIPANTS JOIN FLOW:
    -- Check if a waitlist already exists (invited participants > plan size)
    -- When a waitlist exists and the plan is full:
    IF v_invited_count > v_plan_size AND v_joined_count >= v_plan_size THEN
      -- Put participant on the waitlist.
      -- Do NOT increase the Plan size just because someone joined the waitlist.
      -- The Plan size must remain unchanged when someone is placed on the waitlist.
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
        joined_queue_at,
        responded_at,
        skip_reason,
        delivery_status
      ) VALUES (
        v_plan_record.id,
        v_user_id,
        'PARTICIPANT'::participant_role,
        'WAITLISTED'::rsvp_status,
        NULL,
        NULL,
        now(),
        now(),
        NULL,
        'DELIVERED'
      );

      v_result_rsvp := 'WAITLISTED';
      v_result_assigned_group := NULL;
      v_result_waitlist_position := NULL;
      v_result_plan_size := v_plan_size;

    ELSE
      -- Capacity re-evaluation:
      -- Only increase Plan size if: invited participants === current Plan size
      IF v_invited_count = v_plan_size THEN
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

  ELSE
    -- ASSIGNED mode (Behavior preserved for manually managed participants)
    IF v_plan_size >= v_invited_count THEN
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

    ELSE
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
    END IF;
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


-- ============================================================================
-- 2. UPDATE join_plan
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
  v_has_existing             BOOLEAN := FALSE;
  v_joined_count             INT;
  v_invited_count            INT;
  v_plan_size                INT;
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
  SELECT id, status, plan_size, participant_filtering, invited_participants
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

  -- Explicitly track whether a participant record actually exists before running other queries
  v_has_existing := (v_existing.role IS NOT NULL);

  -- 4. Count current JOINED participants
  SELECT COUNT(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status = 'JOINED'::rsvp_status;

  -- Count total non-skipped invited participants
  SELECT COUNT(*)
    INTO v_invited_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  v_plan_size := COALESCE(v_plan_record.plan_size, 10);

  -- 5. Idempotent check: if already JOINED or WAITLISTED
  IF v_has_existing THEN
    IF v_existing.rsvp_status = 'JOINED'::rsvp_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'rsvp_status', 'JOINED',
        'assigned_group', v_existing.assigned_group::text,
        'already_participating', true,
        'plan_size', v_plan_size
      );
    ELSIF v_existing.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'plan_id', p_plan_id,
        'rsvp_status', 'WAITLISTED',
        'assigned_group', v_existing.assigned_group::text,
        'waitlist_position', v_existing.waitlist_position,
        'already_participating', true,
        'plan_size', v_plan_size
      );
    ELSIF v_existing.rsvp_status = 'SKIPPED'::rsvp_status THEN
      RAISE EXCEPTION 'Participant has left or declined this plan. Please request to rejoin.' USING ERRCODE = '40000';
    END IF;
  END IF;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- 6. State determination
  IF v_plan_record.participant_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    -- Check available capacity:
    IF v_joined_count < v_plan_size THEN
      v_new_status := 'JOINED'::rsvp_status;

      -- If new participant joining directly (was not pre-existing in invited_count):
      -- Only increase Plan size if: invited participants === current Plan size
      IF NOT v_has_existing THEN
        IF v_invited_count = v_plan_size THEN
          v_plan_size := v_plan_size + 1;
          UPDATE public.plans
             SET plan_size = v_plan_size
           WHERE id = p_plan_id;
        END IF;
      END IF;

    ELSE
      -- Plan is full and waitlist exists / entered:
      v_new_status := 'WAITLISTED'::rsvp_status;
      -- Do NOT increase the Plan size just because someone joined the waitlist.
      -- The Plan size must remain unchanged when someone is placed on the waitlist.
    END IF;

    IF v_has_existing THEN
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
    -- ASSIGNED mode (Behavior preserved for manually managed participants)
    IF v_has_existing THEN
      -- Existing row: respect assigned_group if set
      IF v_existing.assigned_group = 'WAITLIST'::assigned_group_enum THEN
        v_new_status := 'WAITLISTED'::rsvp_status;
        v_new_group  := 'WAITLIST'::assigned_group_enum;
      ELSIF v_existing.assigned_group = 'GOING'::assigned_group_enum THEN
        v_new_status := 'JOINED'::rsvp_status;
        v_new_group  := 'GOING'::assigned_group_enum;
      ELSE
        -- Fallback if assigned_group was NULL
        IF v_joined_count < v_plan_size THEN
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
      IF v_joined_count < v_plan_size THEN
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

  -- Ensure invited_participants count on plans is accurate
  UPDATE public.plans
     SET invited_participants = (
       SELECT COUNT(*)
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND rsvp_status != 'SKIPPED'::rsvp_status
     ),
     updated_at = now()
   WHERE id = p_plan_id;

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
    'plan_size', v_plan_size
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO service_role;
