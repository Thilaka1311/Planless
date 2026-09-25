-- Migration: 20260924091000_fix_join_plan_found_bug.sql
-- Description: Fix critical bug in join_plan where SELECT COUNT(*) was overwriting the PL/pgSQL FOUND variable,
--              causing join_plan to erroneously attempt an UPDATE instead of INSERT for new participants.

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

  -- Explicitly track whether a participant record actually exists before running other queries
  v_has_existing := (v_existing.role IS NOT NULL);

  -- 4. Count current JOINED participants
  SELECT COUNT(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status = 'JOINED'::rsvp_status;

  -- 5. Idempotent check: if already JOINED or WAITLISTED
  IF v_has_existing THEN
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
    -- ASSIGNED mode
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
    'plan_size', v_plan_record.plan_size
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO service_role;
