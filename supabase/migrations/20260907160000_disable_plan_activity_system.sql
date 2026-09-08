-- Migration: 20260907160000_disable_plan_activity_system.sql
-- Description: Temporarily disables all writes and reads to public.plan_activity while preserving the table and existing data intact.

-- 1. Disable triggers on plans and plan_participants
DROP TRIGGER IF EXISTS "trg_log_plan_lifecycle_activity" ON "public"."plans";
DROP TRIGGER IF EXISTS "trg_log_plan_participant_activity" ON "public"."plan_participants";

-- 2. Make trigger functions no-ops
CREATE OR REPLACE FUNCTION "public"."log_plan_lifecycle_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Temporarily disabled: do not write plan activity records
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."log_plan_participant_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Temporarily disabled: do not write plan activity records
  RETURN NEW;
END;
$$;

-- 3. Update promote_to_host (remove plan_activity insert)
CREATE OR REPLACE FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may promote participants' USING ERRCODE = '40300';
  END IF;

  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_role = 'HOST'::participant_role THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_target_user_id,
      'already_host', true
    );
  END IF;

  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only Going participants can be promoted to host' USING ERRCODE = '40900';
  END IF;

  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$$;

-- 4. Update request_host_leave_with_replacement (remove plan_activity inserts)
CREATE OR REPLACE FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id          UUID;
  v_caller_role        participant_role;
  v_caller_rsvp        rsvp_status;
  v_target_role        participant_role;
  v_target_rsvp        rsvp_status;
  v_total_cost         NUMERIC;
  v_leave_result       JSONB;
BEGIN
  -- 1. Verify authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists
  SELECT total_cost INTO v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Verify caller is an active HOST
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id
     FOR UPDATE;

  IF NOT FOUND OR v_caller_role <> 'HOST'::participant_role OR v_caller_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only active hosts can perform host replacement leave' USING ERRCODE = '40300';
  END IF;

  -- 4. Verify replacement user
  IF p_replacement_user_id IS NULL OR p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'A valid different replacement user must be specified' USING ERRCODE = '40000';
  END IF;

  SELECT role, rsvp_status
    INTO v_target_role, v_target_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement user is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  -- Strictly enforce: ONLY currently JOINED participants can become hosts
  IF v_target_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 5. Promote replacement to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id = p_replacement_user_id;

  -- 6. Process caller leave based on plan pricing
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    -- Paid Plan -> create pending leave request for caller
    UPDATE public.plan_participants
       SET leave_requested    = TRUE,
           leave_requested_at = now(),
           updated_at         = now()
     WHERE plan_id = p_plan_id
       AND user_id = v_caller_id;

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', true,
      'is_paid_plan', true,
      'activity_id', NULL
    );
  ELSE
    -- Free Plan -> execute immediate leave for caller
    v_leave_result := public.leave_plan(p_plan_id);

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', false,
      'is_paid_plan', false,
      'leave_details', v_leave_result
    );
  END IF;
END;
$$;

-- 5. Update request_paid_plan_leave (remove plan_activity insert)
CREATE OR REPLACE FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id            UUID;
  v_total_cost         NUMERIC;
  v_current_rsvp       rsvp_status;
  v_current_role       participant_role;
  v_leave_requested    BOOLEAN;
  v_remaining_hosts    INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT total_cost
    INTO v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    RAISE EXCEPTION 'This feature is only for paid plans' USING ERRCODE = '40000';
  END IF;

  SELECT role, rsvp_status, leave_requested
    INTO v_current_role, v_current_rsvp, v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'The sole active host cannot submit a leave request' USING ERRCODE = '40300';
    END IF;
  END IF;

  IF v_current_rsvp != 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only joined participants can request to leave' USING ERRCODE = '40000';
  END IF;

  IF v_leave_requested IS TRUE THEN
    RAISE EXCEPTION 'Leave request is already pending' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plan_participants
     SET leave_requested = TRUE,
         leave_requested_at = now(),
         updated_at = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', true,
    'activity_id', NULL
  );
END;
$$;

-- 6. Update stop_hosting_with_replacement (remove plan_activity insert)
CREATE OR REPLACE FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  -- 1. Verify caller authentication & HOST status
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may perform stop hosting replacement' USING ERRCODE = '40300';
  END IF;

  -- 2. Cannot replace host with self
  IF p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot replace host with self' USING ERRCODE = '40000';
  END IF;

  -- 3. Validate replacement candidate: must be member, role = 'PARTICIPANT', rsvp_status = 'JOINED'
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 4. Promote replacement participant to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_replacement_user_id;

  -- 5. Demote caller to PARTICIPANT (maintaining JOINED status, NO leave request)
  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = v_caller_id;

  RETURN jsonb_build_object(
    'success',                  true,
    'plan_id',                  p_plan_id,
    'new_host_id',              p_replacement_user_id,
    'demoted_caller_id',        v_caller_id,
    'caller_role',              'PARTICIPANT',
    'replacement_role',         'HOST'
  );
END;
$$;

-- 7. Update remove_participant (remove plan_activity update)
CREATE OR REPLACE FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_max_participants       INT;
  v_promoted_count         INT := 0;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status, assigned_group, COALESCE(leave_requested, FALSE)
    INTO v_target_role, v_target_status, v_target_assigned_group, v_target_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot remove the last active host
  IF v_target_role = 'HOST'::participant_role AND v_target_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Determine skip_reason:
  IF v_target_leave_requested = TRUE THEN
    v_skip_reason := 'LEFT'::skip_reason;
  ELSE
    v_skip_reason := 'REMOVED'::skip_reason;
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant:
  IF v_target_status = 'INVITED'::rsvp_status THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  ELSE
    UPDATE public.plan_participants
       SET rsvp_status       = 'SKIPPED'::rsvp_status,
           skip_reason       = v_skip_reason,
           assigned_group    = NULL,
           waitlist_position = NULL,
           role              = 'PARTICIPANT'::participant_role,
           leave_requested   = FALSE,
           leave_requested_at= NULL,
           responded_at      = now(),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  END IF;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      IF v_target_status = 'JOINED'::rsvp_status THEN
        v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
      END IF;
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'skip_reason',      CASE WHEN v_target_status = 'INVITED'::rsvp_status THEN NULL ELSE v_skip_reason END,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$$;

-- 8. Update resolve_paid_plan_leave_request (remove plan_activity select and updates)
CREATE OR REPLACE FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id                  UUID;
  v_filtering_mode             participant_filtering_type;
  v_max_participants           INT;
  v_target_rsvp                rsvp_status;
  v_target_leave_req           BOOLEAN;
  v_target_assigned_group      assigned_group_enum;
  v_expense_id                 UUID;
  v_replacement_rsvp           rsvp_status;
  v_replacement_assigned_group assigned_group_enum;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization check: Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type), max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_resolution NOT IN ('REPLACED', 'KEEP_PAYMENT') THEN
    RAISE EXCEPTION 'Invalid resolution type. Must be REPLACED or KEEP_PAYMENT' USING ERRCODE = '40000';
  END IF;

  -- 2. Lock & fetch target participant details
  SELECT rsvp_status, leave_requested, assigned_group
    INTO v_target_rsvp, v_target_leave_req, v_target_assigned_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  -- 3. Transition target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'REPLACED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    SELECT id INTO v_expense_id
      FROM public.wallet_expenses
     WHERE plan_id = p_plan_id AND message_id IS NULL
     LIMIT 1;

    IF v_expense_id IS NOT NULL THEN
      DELETE FROM public.wallet_expense_participants
       WHERE expense_id = v_expense_id
         AND user_id = p_target_user_id
         AND status != 'SETTLED'::wallet_expense_status;
    END IF;

  ELSIF p_resolution = 'KEEP_PAYMENT' THEN
    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'PAYMENT_KEPT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    ELSIF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      PERFORM public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  -- 4. Handle replacement participant if REPLACED
  IF p_replacement_user_id IS NOT NULL AND p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status, assigned_group INTO v_replacement_rsvp, v_replacement_assigned_group
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF FOUND AND (v_replacement_assigned_group = 'GOING'::assigned_group_enum OR (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_rsvp = 'JOINED'::rsvp_status)) THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      -- Replacement is not yet in plan -> invite them as JOINED
      INSERT INTO public.plan_participants (
        plan_id, user_id, role, rsvp_status, assigned_group, waitlist_position, responded_at
      ) VALUES (
        p_plan_id,
        p_replacement_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
        NULL,
        now()
      );
    ELSE
      -- Replacement is already a participant (e.g. on waitlist) -> promote them to JOINED
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
             waitlist_position = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

      IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
        PERFORM public.recalculate_automatic_waitlist_positions(p_plan_id);
      ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        PERFORM public.recalculate_assigned_waitlist_positions(p_plan_id);
      END IF;
    END IF;

    -- Add replacement to wallet expense if exists
    IF v_expense_id IS NOT NULL THEN
      INSERT INTO public.wallet_expense_participants (expense_id, user_id, status)
      VALUES (v_expense_id, p_replacement_user_id, 'PENDING'::wallet_expense_status)
      ON CONFLICT (expense_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'target_user_id', p_target_user_id,
    'resolution', p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;

-- 9. Explicitly deny all client SELECT and INSERT on plan_activity
DROP POLICY IF EXISTS "Allow authenticated users to insert plan_activity" ON "public"."plan_activity";
DROP POLICY IF EXISTS "Allow plan participants to select plan_activity" ON "public"."plan_activity";
DROP POLICY IF EXISTS "Deny insert on plan_activity" ON "public"."plan_activity";
DROP POLICY IF EXISTS "Deny select on plan_activity" ON "public"."plan_activity";

CREATE POLICY "Deny insert on plan_activity" ON "public"."plan_activity"
    FOR INSERT TO authenticated, anon
    WITH CHECK (false);

CREATE POLICY "Deny select on plan_activity" ON "public"."plan_activity"
    FOR SELECT TO authenticated, anon
    USING (false);
