-- Migration: 20260930180000_update_plans_schema_no_limit_and_drop_unused_columns.sql
-- Description: 
-- 1. No Limit plan size: Enforce plan_size IS NULL and participant_filtering IS NULL at DB level.
-- 2. Drop unused columns discovery_item_id (and foreign key) and subcategory from public.plans.
-- 3. Update all dependent functions (sync_plan_participant_cost_share, set_participant_cost_share_on_join,
--    join_plan, get_plan_participant_filtering, invite_participants, complete_plan,
--    manage_completed_plan_participants, update_plan_capacity, move_participant_to_waitlist_and_decrease_capacity).

BEGIN;

-- ============================================================================
-- 1. Clean up existing rows to satisfy No Limit invariant
-- ============================================================================
UPDATE public.plans
   SET participant_filtering = NULL
 WHERE plan_size IS NULL;

UPDATE public.plans
   SET plan_size = NULL
 WHERE participant_filtering IS NULL;

-- ============================================================================
-- 2. Alter public.plans columns
-- ============================================================================
-- Make participant_filtering nullable and remove default 'AUTOMATIC'
ALTER TABLE public.plans
  ALTER COLUMN participant_filtering DROP DEFAULT,
  ALTER COLUMN participant_filtering DROP NOT NULL;

-- Drop foreign key constraint on discovery_item_id
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_discovery_item_id_fkey;

-- Drop unused columns
ALTER TABLE public.plans
  DROP COLUMN IF EXISTS discovery_item_id,
  DROP COLUMN IF EXISTS subcategory;

-- ============================================================================
-- 3. Add CHECK constraint & trigger for No Limit invariant
-- ============================================================================
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS check_no_limit_plan_size_and_filtering;

ALTER TABLE public.plans
  ADD CONSTRAINT check_no_limit_plan_size_and_filtering
  CHECK (
    (plan_size IS NULL AND participant_filtering IS NULL)
    OR
    (plan_size IS NOT NULL AND participant_filtering IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.enforce_no_limit_plan_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- When plan_size is NULL (No Limit), participant_filtering must be NULL
  IF NEW.plan_size IS NULL THEN
    NEW.participant_filtering := NULL;
  ELSIF NEW.participant_filtering IS NULL THEN
    NEW.participant_filtering := 'AUTOMATIC';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_no_limit_plan_fields ON public.plans;
CREATE TRIGGER trg_enforce_no_limit_plan_fields
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_no_limit_plan_fields();

CREATE OR REPLACE FUNCTION public.handle_plan_size_null_auto_promote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.plan_size IS NULL AND (OLD.plan_size IS NOT NULL OR OLD.participant_filtering IS NOT NULL) THEN
    -- Any currently WAITLISTED participants in this plan become JOINED
    UPDATE public.plan_participants
       SET rsvp_status = 'JOINED',
           assigned_group = 'GOING',
           waitlist_position = NULL
     WHERE plan_id = NEW.id
       AND (rsvp_status = 'WAITLISTED' OR assigned_group = 'WAITLIST');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_plan_size_null_auto_promote ON public.plans;
CREATE TRIGGER trg_handle_plan_size_null_auto_promote
  AFTER UPDATE OF plan_size, participant_filtering ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_plan_size_null_auto_promote();

-- ============================================================================
-- 4. Update sync_plan_participant_cost_share()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_plan_participant_cost_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_share NUMERIC(10,2) := 0;
  v_joined_count INT := 0;
BEGIN
  -- Compute per participant share from NEW total_cost and plan_size
  IF NEW.total_cost IS NOT NULL AND NEW.total_cost > 0 THEN
    IF NEW.plan_size IS NOT NULL AND NEW.plan_size > 0 THEN
      v_share := ROUND(NEW.total_cost / NEW.plan_size, 2);
    ELSE
      -- For No Limit plans (plan_size IS NULL), divide by count of active joined participants
      SELECT COUNT(*) INTO v_joined_count
        FROM public.plan_participants
       WHERE plan_id = NEW.id AND rsvp_status = 'JOINED'::rsvp_status;

      IF v_joined_count > 0 THEN
        v_share := ROUND(NEW.total_cost / v_joined_count, 2);
      ELSE
        v_share := 0;
      END IF;
    END IF;
  ELSE
    v_share := 0;
  END IF;

  -- Update active (JOINED) participants
  UPDATE public.plan_participants
     SET cost_per_participant = v_share,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status = 'JOINED'::rsvp_status;

  -- Clear non-active participants
  UPDATE public.plan_participants
     SET cost_per_participant = NULL,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status != 'JOINED'::rsvp_status;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 5. Update set_participant_cost_share_on_join()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_participant_cost_share_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_cost NUMERIC(10,2);
  v_plan_size INT;
  v_joined_count INT := 0;
BEGIN
  IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT total_cost, plan_size
      INTO v_total_cost, v_plan_size
      FROM public.plans
     WHERE id = NEW.plan_id;

    IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
      IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
        NEW.cost_per_participant := ROUND(v_total_cost / v_plan_size, 2);
      ELSE
        -- For No Limit plans, count current joined participants (excluding this row if already in table)
        SELECT COUNT(*) INTO v_joined_count
          FROM public.plan_participants
         WHERE plan_id = NEW.plan_id
           AND rsvp_status = 'JOINED'::rsvp_status
           AND user_id <> NEW.user_id;

        NEW.cost_per_participant := ROUND(v_total_cost / GREATEST(1, v_joined_count + 1), 2);
      END IF;
    ELSE
      NEW.cost_per_participant := 0;
    END IF;
  ELSE
    NEW.cost_per_participant := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- 6. Update get_plan_participant_filtering(uuid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_plan_participant_filtering(p_plan_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT participant_filtering::TEXT
  FROM public.plans
  WHERE id = p_plan_id;
$$;

-- ============================================================================
-- 7. Update join_plan(uuid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.join_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id           UUID;
  v_plan_record       RECORD;
  v_existing          RECORD;
  v_has_existing      BOOLEAN := FALSE;
  v_joined_count      INT;
  v_new_status        rsvp_status;
  v_new_group         assigned_group_enum := NULL;
  v_next_pos          INT := NULL;
  v_was_system_op     TEXT;
BEGIN
  -- 1. Identify caller
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Lock plan row FOR UPDATE to prevent race conditions on capacity
  SELECT id, created_by, status, participant_filtering, plan_size
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

  -- Hard system maximum ceiling: 50 joined participants
  IF v_joined_count >= 50 THEN
    RAISE EXCEPTION 'Plan size reached. This plan already has 50 participants. No more participants can join this plan.' USING ERRCODE = '40001';
  END IF;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- 6. State determination
  IF v_plan_record.plan_size IS NULL THEN
    -- No Limit plan: strictly no waitlist, no assigned groups, joined directly up to 50
    v_new_status := 'JOINED'::rsvp_status;
    v_new_group  := NULL;
    v_next_pos   := NULL;

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

  ELSIF v_plan_record.participant_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    -- Limited plan with AUTOMATIC filtering
    IF v_joined_count < v_plan_record.plan_size THEN
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
    -- Limited plan with ASSIGNED mode
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
        IF v_joined_count < v_plan_record.plan_size THEN
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
      IF v_joined_count < v_plan_record.plan_size THEN
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
$$;

-- ============================================================================
-- 8. Update invite_participants(uuid, uuid[], assigned_group_enum)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id uuid,
  p_invitee_user_ids uuid[],
  p_assigned_group assigned_group_enum DEFAULT 'GOING'::assigned_group_enum
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

  -- Determine effective assigned_group (NULL if AUTOMATIC or No Limit)
  IF v_filtering IS NULL OR v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
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
                 skip_reason = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        END IF;
      ELSE
        -- Insert new participant record as INVITED
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
$$;

-- ============================================================================
-- 9. Update complete_plan(uuid, jsonb, text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_plan(p_plan_id uuid, p_attendance_input jsonb, p_expense_mode text DEFAULT 'NONE'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_rsvp_deadline TIMESTAMPTZ;
  v_participant RECORD;
  v_input_attendance attendance_status;
  v_final_attendance attendance_status;
  v_final_state rsvp_status;
  v_final_count INT;
  v_old_plan_size INT;
  v_plan_expense RECORD;
  v_share NUMERIC;
  v_final_total_cost NUMERIC;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, scheduled_at, rsvp_deadline, total_cost, plan_size
  INTO v_plan_status, v_scheduled_at, v_rsvp_deadline, v_final_total_cost, v_old_plan_size
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_ALREADY_COMPLETED' USING ERRCODE = '40000';
  END IF;

  IF v_plan_status = 'CANCELLED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_CANCELLED' USING ERRCODE = '40000';
  END IF;

  IF jsonb_typeof(p_attendance_input) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE_FORMAT' USING ERRCODE = '40000';
  END IF;

  -- 3. Auto-insert newly added attendees
  INSERT INTO public.plan_participants (
    plan_id, user_id, rsvp_status, final_attendance, final_state, created_at, updated_at
  )
  SELECT
    p_plan_id,
    (item->>'user_id')::UUID,
    'JOINED'::rsvp_status,
    'ATTENDED'::attendance_status,
    'JOINED'::rsvp_status,
    now(),
    now()
  FROM jsonb_array_elements(p_attendance_input) AS arr(item)
  WHERE (item->>'attendance') = 'ATTENDED'
    AND (item->>'user_id')::UUID NOT IN (
      SELECT user_id FROM public.plan_participants WHERE plan_id = p_plan_id
    )
  ON CONFLICT (plan_id, user_id) DO NOTHING;

  -- 4. Finalize attendance for all participants
  FOR v_participant IN
    SELECT user_id, role, rsvp_status, skip_reason
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
    FOR UPDATE
  LOOP
    v_input_attendance := NULL;

    SELECT (item->>'attendance')::attendance_status
    INTO v_input_attendance
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_participant.user_id;

    IF v_participant.user_id = v_caller_id THEN
      -- The completing host is present and verified as attended
      v_final_attendance := 'ATTENDED'::attendance_status;
      v_final_state := 'JOINED'::rsvp_status;

    ELSIF v_input_attendance IS NOT NULL THEN
      v_final_attendance := v_input_attendance;
      IF v_input_attendance = 'ATTENDED'::attendance_status THEN
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;

    ELSE
      -- Fallback for participants not explicitly present in payload
      IF v_participant.rsvp_status = 'JOINED'::rsvp_status THEN
        v_final_attendance := 'ATTENDED'::attendance_status;
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_attendance := 'DID_NOT_ATTEND'::attendance_status;
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;
    END IF;

    UPDATE public.plan_participants
    SET rsvp_status = v_final_state,
        final_attendance = v_final_attendance,
        final_state = v_final_state,
        skip_reason = CASE
          WHEN v_final_attendance = 'ATTENDED'::attendance_status THEN NULL
          WHEN v_participant.rsvp_status IN ('JOINED'::rsvp_status, 'INVITED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN NULL
          ELSE skip_reason
        END,
        updated_at = now()
    WHERE plan_id = p_plan_id AND user_id = v_participant.user_id;
  END LOOP;

  -- 5. Calculate Final Attended Count
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 6. Handle Plan Expense Recalculation
  IF p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') AND v_final_count > 0 THEN
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id
      AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_plan_expense.id IS NOT NULL THEN
      IF p_expense_mode = 'SPLIT_ALL' THEN
        v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        v_final_total_cost := v_plan_expense.total_amount;
      ELSIF p_expense_mode = 'KEEP_CURRENT_COST' THEN
        -- Priority 1: Check existing cost_per_participant from plan_participants
        SELECT cost_per_participant INTO v_share
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND cost_per_participant > 0
        LIMIT 1;

        -- Priority 2: Check amount_owed from wallet_expense_participants
        IF v_share IS NULL OR v_share <= 0 THEN
          SELECT amount_owed INTO v_share
          FROM public.wallet_expense_participants
          WHERE expense_id = v_plan_expense.id AND amount_owed > 0
          ORDER BY amount_owed DESC
          LIMIT 1;
        END IF;

        -- Priority 3: Derive from existing plan total_cost and plan_size
        IF (v_share IS NULL OR v_share <= 0) AND v_old_plan_size IS NOT NULL AND v_old_plan_size > 0 THEN
          v_share := ROUND((v_final_total_cost / v_old_plan_size)::numeric, 2);
        END IF;

        -- Priority 4: Fallback to total expense / final_count
        IF v_share IS NULL OR v_share <= 0 THEN
          v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        END IF;

        v_final_total_cost := v_share * v_final_count;

        UPDATE public.wallet_expenses
        SET total_amount = v_final_total_cost,
            updated_at = NOW()
        WHERE id = v_plan_expense.id;
      END IF;

      IF v_share IS NULL THEN
        v_share := 0;
      END IF;

      -- Reconcile participant obligations
      FOR v_participant IN
        SELECT user_id, final_attendance
        FROM public.plan_participants
        WHERE plan_id = p_plan_id
      LOOP
        IF v_participant.final_attendance = 'ATTENDED'::attendance_status THEN
          INSERT INTO public.wallet_expense_participants (
            expense_id, user_id, amount_owed, amount_paid, status, created_at, updated_at
          )
          VALUES (
            v_plan_expense.id, v_participant.user_id, v_share, 0, 'PENDING', now(), now()
          )
          ON CONFLICT (expense_id, user_id) DO UPDATE
          SET amount_owed = EXCLUDED.amount_owed,
              status = CASE
                 WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                 WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                 ELSE EXCLUDED.status
               END,
              updated_at = now();
        ELSE
          IF NOT EXISTS (
            SELECT 1 FROM public.plan_participants
            WHERE plan_id = p_plan_id
              AND user_id = v_participant.user_id
              AND skip_reason = 'PAYMENT_KEPT'
          ) THEN
            DELETE FROM public.wallet_expense_participants
            WHERE expense_id = v_plan_expense.id
              AND user_id = v_participant.user_id
              AND status != 'SETTLED';
          END IF;
        END IF;
      END LOOP;

    END IF;
  END IF;

  -- 7. Update Plan Status & attended_participants & total_cost & plan_size
  IF now() < v_scheduled_at THEN
    v_scheduled_at := now();
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      attended_participants = v_final_count,
      plan_size = CASE WHEN v_old_plan_size IS NULL THEN NULL ELSE v_final_count END,
      total_cost = v_final_total_cost,
      scheduled_at = v_scheduled_at,
      rsvp_deadline = v_rsvp_deadline,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'COMPLETED',
    'attended_participants', v_final_count,
    'plan_size', CASE WHEN v_old_plan_size IS NULL THEN NULL ELSE v_final_count END,
    'final_count', v_final_count,
    'total_cost', v_final_total_cost,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );
END;
$$;

-- ============================================================================
-- 10. Update manage_completed_plan_participants(uuid, uuid[], uuid[], text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(
  p_plan_id uuid,
  p_users_to_add uuid[] DEFAULT NULL::uuid[],
  p_users_to_remove uuid[] DEFAULT NULL::uuid[],
  p_expense_mode text DEFAULT 'NONE'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_target_user_id UUID;
  v_initial_attendee_count INT;
  v_final_count INT;
  v_old_plan_size INT;
  v_participant RECORD;
  v_plan_expense RECORD;
  v_initial_total_cost NUMERIC;
  v_initial_share NUMERIC;
  v_share NUMERIC;
  v_new_total_cost NUMERIC;
  v_final_invited INT;
  v_remaining_hosts INT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, total_cost, scheduled_at, plan_size
  INTO v_plan_status, v_initial_total_cost, v_scheduled_at, v_old_plan_size
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active host
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
  ) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 3. Calculate initial attendee count
  SELECT count(*) INTO v_initial_attendee_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 4. Process Attended list
  IF p_users_to_add IS NOT NULL THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_add
    LOOP
      IF v_target_user_id IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.plan_participants (
        plan_id, user_id, role, rsvp_status, final_attendance, final_state, created_at, updated_at
      )
      VALUES (
        p_plan_id, v_target_user_id, 'PARTICIPANT'::participant_role, 'JOINED'::rsvp_status, 'ATTENDED'::attendance_status, 'JOINED'::rsvp_status, now(), now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE
      SET rsvp_status = 'JOINED'::rsvp_status,
          final_attendance = 'ATTENDED'::attendance_status,
          final_state = 'JOINED'::rsvp_status,
          skip_reason = NULL,
          updated_at = now();
    END LOOP;
  END IF;

  -- 5. Process Did Not Attend list
  IF p_users_to_remove IS NOT NULL THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove
    LOOP
      IF v_target_user_id IS NULL THEN CONTINUE; END IF;

      -- Check last remaining active host protection
      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
      ) THEN
        SELECT count(*) INTO v_remaining_hosts
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status AND user_id != v_target_user_id;

        IF v_remaining_hosts < 1 THEN
          RAISE EXCEPTION 'CANNOT_REMOVE_LAST_HOST' USING ERRCODE = '40300';
        END IF;
      END IF;

      UPDATE public.plan_participants
      SET rsvp_status = 'SKIPPED'::rsvp_status,
          final_attendance = 'DID_NOT_ATTEND'::attendance_status,
          final_state = 'SKIPPED'::rsvp_status,
          skip_reason = NULL,
          updated_at = now()
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
    END LOOP;
  END IF;

  -- 6. Recalculate Final Counts
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT count(*) INTO v_final_invited
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- 7. Expense Recalculation
  IF p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') AND v_final_count > 0 THEN
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id
      AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_plan_expense.id IS NOT NULL THEN
      IF p_expense_mode = 'SPLIT_ALL' THEN
        v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        v_new_total_cost := v_plan_expense.total_amount;
      ELSIF p_expense_mode = 'KEEP_CURRENT_COST' THEN
        SELECT cost_per_participant INTO v_initial_share
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND cost_per_participant > 0
        LIMIT 1;

        IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
          SELECT amount_owed INTO v_initial_share
          FROM public.wallet_expense_participants
          WHERE expense_id = v_plan_expense.id AND amount_owed > 0
          ORDER BY amount_owed DESC
          LIMIT 1;
        END IF;

        IF (v_initial_share IS NULL OR v_initial_share <= 0) AND v_old_plan_size IS NOT NULL AND v_old_plan_size > 0 THEN
          v_initial_share := ROUND((v_initial_total_cost / v_old_plan_size)::numeric, 2);
        END IF;

        IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
          v_initial_share := ROUND((v_plan_expense.total_amount / GREATEST(1, v_initial_attendee_count))::numeric, 2);
        END IF;

        v_share := v_initial_share;
        v_new_total_cost := v_share * v_final_count;

        UPDATE public.wallet_expenses
        SET total_amount = v_new_total_cost, updated_at = now()
        WHERE id = v_plan_expense.id;
      END IF;

      FOR v_participant IN
        SELECT pp.user_id, wep.id AS wallet_part_id, wep.status AS wallet_part_status
        FROM public.plan_participants pp
        LEFT JOIN public.wallet_expense_participants wep
          ON wep.expense_id = v_plan_expense.id AND wep.user_id = pp.user_id
        WHERE pp.plan_id = p_plan_id
      LOOP
        IF EXISTS (
          SELECT 1 FROM public.plan_participants
          WHERE plan_id = p_plan_id AND user_id = v_participant.user_id AND final_attendance = 'ATTENDED'::attendance_status
        ) THEN
          IF v_participant.wallet_part_id IS NOT NULL THEN
            IF v_participant.wallet_part_status != 'SETTLED' THEN
              UPDATE public.wallet_expense_participants
              SET amount_owed = v_share, updated_at = now()
              WHERE id = v_participant.wallet_part_id;
            END IF;
          ELSE
            INSERT INTO public.wallet_expense_participants (
              expense_id, user_id, amount_owed, amount_paid, status, created_at, updated_at
            )
            VALUES (
              v_plan_expense.id, v_participant.user_id, v_share, 0, 'PENDING', now(), now()
            );
          END IF;
        ELSE
          IF v_participant.wallet_part_id IS NOT NULL AND v_participant.wallet_part_status != 'SETTLED' THEN
            DELETE FROM public.wallet_expense_participants WHERE id = v_participant.wallet_part_id;
          END IF;
        END IF;
      END LOOP;
    ELSE
      v_new_total_cost := v_initial_total_cost;
    END IF;
  ELSE
    v_new_total_cost := v_initial_total_cost;
  END IF;

  -- 8. Update plan totals & counts (preserving plan_size = NULL if No Limit)
  UPDATE public.plans
  SET
    attended_participants = v_final_count,
    plan_size = CASE WHEN v_old_plan_size IS NULL THEN NULL ELSE v_final_count END,
    invited_participants = v_final_invited,
    total_cost = coalesce(v_new_total_cost, total_cost),
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'invited_participants', v_final_invited,
    'attended_participants', v_final_count,
    'plan_size', CASE WHEN v_old_plan_size IS NULL THEN NULL ELSE v_final_count END,
    'total_cost', coalesce(v_new_total_cost, v_initial_total_cost),
    'final_count', v_final_count
  );
END;
$$;

-- ============================================================================
-- 11. Update update_plan_capacity(uuid, integer, boolean)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id uuid,
  p_plan_size integer,
  p_auto_promote boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID;
  v_filtering          TEXT;
  v_promoted_count     INT := 0;
  v_demoted_count      INT := 0;
  v_host_count         INT := 0;
  v_current_going      INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering::TEXT
    INTO v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_plan_size IS NULL OR p_plan_size < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  -- If plan was previously No Limit (participant_filtering IS NULL), setting a capacity sets participant_filtering to AUTOMATIC
  IF v_filtering IS NULL THEN
    v_filtering := 'AUTOMATIC';
    UPDATE public.plans
       SET plan_size = p_plan_size,
           participant_filtering = 'AUTOMATIC'::participant_filtering_type,
           updated_at = now()
     WHERE id = p_plan_id;
  ELSE
    UPDATE public.plans
       SET plan_size   = p_plan_size,
           updated_at  = now()
     WHERE id = p_plan_id;
  END IF;

  IF v_filtering = 'ASSIGNED' THEN
    IF COALESCE(p_auto_promote, true) THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      IF v_current_going < p_plan_size THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, 'GOING'::assigned_group_enum);
      ELSIF v_current_going > p_plan_size THEN
        SELECT COUNT(*) INTO v_host_count
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND role = 'HOST'::participant_role
           AND assigned_group = 'GOING'::assigned_group_enum
           AND rsvp_status != 'SKIPPED'::rsvp_status;

        WITH ranked_going AS (
          SELECT pp.user_id,
                 ROW_NUMBER() OVER (
                   ORDER BY pp.joined_queue_at ASC NULLS LAST,
                            COALESCE(u.full_name, u.username, '') ASC
                 ) AS pos
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id
             AND pp.assigned_group = 'GOING'::assigned_group_enum
             AND pp.rsvp_status != 'SKIPPED'::rsvp_status
             AND pp.role != 'HOST'::participant_role
        )
        UPDATE public.plan_participants pp
           SET assigned_group    = 'WAITLIST'::assigned_group_enum,
               rsvp_status       = CASE
                                     WHEN pp.rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                                     ELSE pp.rsvp_status
                                   END,
               waitlist_position = 2147483647,
               updated_at        = now()
          FROM ranked_going rg
         WHERE pp.plan_id = p_plan_id
           AND pp.user_id = rg.user_id
           AND rg.pos > GREATEST(0, p_plan_size - v_host_count);

        GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);
      END IF;
    END IF;

    PERFORM public.recalculate_wallet_expenses(p_plan_id);
  ELSE
    -- Automatic mode:
    IF COALESCE(p_auto_promote, true) THEN
      SELECT COUNT(*) INTO v_host_count
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status;

      WITH ranked_joined AS (
        SELECT pp.user_id,
               ROW_NUMBER() OVER (
                 ORDER BY pp.joined_queue_at ASC NULLS LAST,
                          COALESCE(u.full_name, u.username, '') ASC
               ) AS pos
          FROM public.plan_participants pp
          LEFT JOIN public.users u ON u.id = pp.user_id
         WHERE pp.plan_id = p_plan_id
           AND pp.rsvp_status = 'JOINED'::rsvp_status
           AND pp.role != 'HOST'::participant_role
      )
      UPDATE public.plan_participants pp
         SET rsvp_status = 'WAITLISTED'::rsvp_status,
             updated_at  = now()
        FROM ranked_joined rj
       WHERE pp.plan_id = p_plan_id
         AND pp.user_id = rj.user_id
         AND rj.pos > GREATEST(0, p_plan_size - v_host_count);

      GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

      PERFORM public.rebuild_waitlist_queue(p_plan_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_plan_size', p_plan_size,
    'plan_size', p_plan_size,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$$;

-- ============================================================================
-- 12. Update move_participant_to_waitlist_and_decrease_capacity(uuid, uuid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(
  p_plan_id uuid,
  p_target_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id         UUID;
  v_current_plan_size INT;
  v_new_plan_size     INT;
  v_next_pos          INT;
  v_target_row        RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
  END IF;

  SELECT plan_size
    INTO v_current_plan_size
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_current_plan_size IS NULL THEN
    RAISE EXCEPTION 'Cannot move participants to waitlist on a No Limit plan' USING ERRCODE = '40000';
  END IF;

  SELECT assigned_group, rsvp_status, role
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
  END IF;

  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum;

  v_new_plan_size := GREATEST(1, v_current_plan_size - 1);

  -- Decrement plan_size only; invited_participants does NOT change
  UPDATE public.plans
     SET plan_size   = v_new_plan_size,
         updated_at  = now()
   WHERE id = p_plan_id;

  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_next_pos,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'plan_id',           p_plan_id,
    'target_user_id',    p_target_user_id,
    'new_capacity',      v_new_plan_size,
    'plan_size',         v_new_plan_size,
    'waitlist_position', v_next_pos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_plan(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(uuid, uuid[], uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(uuid, uuid) TO authenticated, service_role;

COMMIT;
