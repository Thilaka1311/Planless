-- Migration: Migrate Host Authorization to plan_participants.role = 'HOST'
-- Description: Establishes plan_participants.role = 'HOST' as the single source of truth for host authorization,
-- supporting multiple active hosts per plan and removing dependencies on plans.host_id.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper Function: is_plan_host
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_plan_host(p_plan_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
      AND user_id = p_user_id
      AND role = 'HOST'::participant_role
      AND rsvp_status = 'JOINED'::rsvp_status
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_plan_host(UUID, UUID) TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. promote_to_host RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.promote_to_host(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  -- 1. Identify authenticated user
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Authorization: Caller must have role = 'HOST' and rsvp_status = 'JOINED'
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may promote participants' USING ERRCODE = '40300';
  END IF;

  -- 4. Fetch target participant's current role and rsvp_status
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  -- 5. Target is ALREADY a host -> silently return success
  IF v_target_role = 'HOST'::participant_role THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_target_user_id,
      'already_host', true
    );
  END IF;

  -- 6. Target must be in the Going (JOINED) state
  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only Going participants can be promoted to host' USING ERRCODE = '40900';
  END IF;

  -- 7. Promote target to HOST role in plan_participants (preserves existing hosts)
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  -- 8. Log host_promoted activity in public.plan_activity
  INSERT INTO public.plan_activity (
    plan_id,
    actor_id,
    target_user_id,
    activity_type,
    metadata
  ) VALUES (
    p_plan_id,
    v_caller_id,
    p_target_user_id,
    'host_promoted'::plan_activity_type,
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.promote_to_host(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. demote_from_host RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.demote_from_host(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_remaining_hosts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization: Caller must have role = 'HOST' and rsvp_status = 'JOINED'
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may demote hosts' USING ERRCODE = '40300';
  END IF;

  -- 2. Verify target participant
  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_role <> 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Target user is not currently a host' USING ERRCODE = '40900';
  END IF;

  -- 3. Last-host protection: Must leave at least one active HOST
  SELECT COUNT(*)
    INTO v_remaining_hosts
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND role = 'HOST'::participant_role
     AND rsvp_status = 'JOINED'::rsvp_status
     AND user_id <> p_target_user_id;

  IF v_remaining_hosts < 1 THEN
    RAISE EXCEPTION 'Cannot demote the last remaining active host' USING ERRCODE = '40000';
  END IF;

  -- 4. Demote target participant
  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'demoted_user_id',  p_target_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.demote_from_host(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. cancel_plan RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may cancel the plan' USING ERRCODE = '40300';
  END IF;

  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_plan(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. leave_plan RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_max_participants         INT;
  v_total_cost               NUMERIC;
  v_current_role             participant_role;
  v_current_rsvp             rsvp_status;
  v_vacated_group            assigned_group_enum;
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_remaining_hosts          INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT max_participants, total_cost, participant_filtering
    INTO v_max_participants, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Fetch participant record
  SELECT role, rsvp_status, assigned_group
    INTO v_current_role, v_current_rsvp, v_vacated_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- Last-host protection: Host cannot leave if they are the sole active host
  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot leave the plan as the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Transition leaving participant
  UPDATE public.plan_participants
     SET role              = 'PARTICIPANT'::participant_role,
         rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'LEFT'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_vacated_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_vacated_group);
      END IF;
    END IF;
  END IF;

  -- Recalculate cost shares if applicable
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
    ELSE
      v_new_cost_per_participant := NULL;
    END IF;

    UPDATE public.plan_participants
       SET cost_per_participant = v_new_cost_per_participant,
           updated_at           = now()
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   NULL,
    'promoted_count',     v_promoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_plan(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. complete_plan RPC (Both Overloaded Signatures)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_plan(p_plan_id uuid, p_attendance_input jsonb, p_expense_mode text DEFAULT 'NONE'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  SELECT status, scheduled_at, rsvp_deadline, total_cost
  INTO v_plan_status, v_scheduled_at, v_rsvp_deadline, v_final_total_cost
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
        SELECT amount_owed INTO v_share
        FROM public.wallet_expense_participants
        WHERE expense_id = v_plan_expense.id AND amount_owed > 0
        ORDER BY amount_owed DESC
        LIMIT 1;

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
          DELETE FROM public.wallet_expense_participants
          WHERE expense_id = v_plan_expense.id 
            AND user_id = v_participant.user_id
            AND status != 'SETTLED';
        END IF;
      END LOOP;

    END IF;
  END IF;

  -- 7. Update Plan Status & attended_participants & total_cost
  IF now() < v_scheduled_at THEN
    v_scheduled_at := now();
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      attended_participants = v_final_count,
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
    'final_count', v_final_count,
    'total_cost', v_final_total_cost,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );

END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_plan(p_plan_id uuid, p_attendance_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.complete_plan(p_plan_id, p_attendance_input, 'NONE'::text);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_plan(UUID, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_plan(UUID, JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. manage_completed_plan_participants RPC (Both Overloads)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(p_plan_id uuid, p_users_to_add uuid[] DEFAULT '{}'::uuid[], p_users_to_remove uuid[] DEFAULT '{}'::uuid[], p_expense_mode text DEFAULT 'NONE'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_target_user_id UUID;
  v_initial_attendee_count INT;
  v_final_count INT;
  v_participant RECORD;
  v_plan_expense RECORD;
  v_initial_total_cost NUMERIC;
  v_initial_share NUMERIC;
  v_share NUMERIC;
  v_new_total_cost NUMERIC;
  v_new_max_participants INT;
  v_orig_max_participants INT;
  v_remaining_hosts INT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, total_cost, scheduled_at, max_participants
  INTO v_plan_status, v_initial_total_cost, v_scheduled_at, v_orig_max_participants
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be a host
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
  ) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 2b. Enforce 24-hour participant management window from scheduled_at
  IF v_scheduled_at IS NOT NULL AND now() >= (v_scheduled_at + INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'This plan can no longer be managed because the 24-hour participant management window has expired.' USING ERRCODE = '40000';
  END IF;

  -- 3. Capture Initial State BEFORE participant mutations
  SELECT count(*) INTO v_initial_attendee_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT * INTO v_plan_expense
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id
    AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_plan_expense.id IS NOT NULL THEN
    SELECT amount_owed INTO v_initial_share
    FROM public.wallet_expense_participants
    WHERE expense_id = v_plan_expense.id AND amount_owed > 0
    ORDER BY amount_owed DESC
    LIMIT 1;

    IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
      IF v_initial_attendee_count > 0 THEN
        v_initial_share := ROUND((v_plan_expense.total_amount / v_initial_attendee_count)::numeric, 2);
      ELSE
        v_initial_share := 0;
      END IF;
    END IF;
  ELSE
    v_initial_share := 0;
  END IF;

  -- 4. Process Additions
  IF p_users_to_add IS NOT NULL AND array_length(p_users_to_add, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_add LOOP
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        final_attendance,
        final_state,
        skip_reason,
        created_at,
        updated_at
      )
      VALUES (
        p_plan_id,
        v_target_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        'ATTENDED'::attendance_status,
        'JOINED'::rsvp_status,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE SET
        rsvp_status = 'JOINED'::rsvp_status,
        final_attendance = 'ATTENDED'::attendance_status,
        final_state = 'JOINED'::rsvp_status,
        skip_reason = NULL,
        updated_at = now();
    END LOOP;
  END IF;

  -- 5. Process Removals
  IF p_users_to_remove IS NOT NULL AND array_length(p_users_to_remove, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove LOOP
      -- Last-host check for removal
      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id AND role = 'HOST'::participant_role
      ) THEN
        SELECT COUNT(*) INTO v_remaining_hosts
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND user_id <> v_target_user_id AND user_id <> ALL(p_users_to_remove);

        IF v_remaining_hosts < 1 THEN
          -- Prevent removing the last remaining host
          CONTINUE;
        END IF;
      END IF;

      UPDATE public.plan_participants
      SET
        rsvp_status = 'SKIPPED'::rsvp_status,
        final_attendance = 'DID_NOT_ATTEND'::attendance_status,
        final_state = 'SKIPPED'::rsvp_status,
        updated_at = now()
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
    END LOOP;
  END IF;

  -- 6. Authoritative Final Attendance & Capacity Calculation
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  v_new_max_participants := GREATEST(coalesce(v_orig_max_participants, 1), v_final_count);

  -- 7. Expense Mode Recalculation
  IF v_plan_expense.id IS NOT NULL THEN
    IF p_expense_mode = 'KEEP_CURRENT_COST' THEN
      v_share := v_initial_share;
      v_new_total_cost := v_share * v_final_count;
    ELSIF p_expense_mode = 'SPLIT_ALL' THEN
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    ELSE
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    END IF;

    -- Update total expense amount
    UPDATE public.wallet_expenses
    SET total_amount = v_new_total_cost, updated_at = now()
    WHERE id = v_plan_expense.id;

    -- Re-allocate per-person shares for ATTENDED members
    FOR v_participant IN
      SELECT pp.user_id, wep.id as wallet_part_id, wep.status as wallet_part_status, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.wallet_expense_participants wep
        ON wep.expense_id = v_plan_expense.id AND wep.user_id = pp.user_id
      WHERE pp.plan_id = p_plan_id
    LOOP
      IF v_participant.skip_reason = 'PAYMENT_KEPT' THEN
        CONTINUE;
      END IF;

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
            expense_id,
            user_id,
            amount_owed,
            amount_paid,
            status,
            created_at,
            updated_at
          )
          VALUES (
            v_plan_expense.id,
            v_participant.user_id,
            v_share,
            0,
            'PENDING',
            now(),
            now()
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

  -- 8. Update plan totals & counts
  UPDATE public.plans
  SET
    attended_participants = v_final_count,
    max_participants = v_new_max_participants,
    total_cost = coalesce(v_new_total_cost, total_cost),
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'max_participants', v_new_max_participants,
    'attended_participants', v_final_count,
    'total_cost', coalesce(v_new_total_cost, v_initial_total_cost),
    'final_count', v_final_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(p_plan_id uuid, p_users_to_add uuid[], p_users_to_remove uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.manage_completed_plan_participants(p_plan_id, p_users_to_add, p_users_to_remove, 'NONE'::text);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(UUID, UUID[], UUID[], TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(UUID, UUID[], UUID[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. move_participant_to_waitlist_and_decrease_capacity RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_current_max        INT;
  v_new_max            INT;
  v_target_row         RECORD;
  v_next_pos           INT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- 1. Identify authenticated caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller is an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
  END IF;

  SELECT max_participants
    INTO v_current_max
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Lock and verify target participant
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

  -- 4. Calculate next waitlist position
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum;

  -- 5. Decrease plan capacity by 1 (minimum capacity is 2)
  v_new_max := GREATEST(2, v_current_max - 1);

  UPDATE public.plans
     SET max_participants = v_new_max,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- 6. Move target participant to waitlist
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
    'new_capacity',      v_new_max,
    'waitlist_position', v_next_pos
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. move_waitlist_to_going RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.move_waitlist_to_going(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_max_participants   INT;
  v_total_cost         NUMERIC;
  v_target_status      rsvp_status;
  v_joined_count       INT := 0;
  v_active_count       INT := 0;
  v_new_cost           NUMERIC;
  v_filtering          TEXT;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Check caller host permissions
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only hosts can move waitlisted participants into Going' USING ERRCODE = '40300';
  END IF;

  -- 3. Fetch plan attributes
  SELECT max_participants, total_cost,
         COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_max_participants, v_total_cost, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Reject manual move on AUTOMATIC plans
  IF v_filtering <> 'ASSIGNED' THEN
    RAISE EXCEPTION 'Manual queue movement is not allowed on Automatic plans'
      USING ERRCODE = '40300';
  END IF;

  -- 4. Check target participant's status
  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status = 'JOINED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_joined', true
    );
  END IF;

  -- 5. Capacity Check
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_joined_count >= v_max_participants THEN
      RAISE EXCEPTION 'Going list is already full (% / %)', v_joined_count, v_max_participants
        USING ERRCODE = '40900';
    END IF;
  END IF;

  -- 6. Promote target participant to JOINED
  UPDATE public.plan_participants
     SET rsvp_status  = 'JOINED'::rsvp_status,
         skip_reason  = NULL,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 7. Recalculate cost_per_participant if total_cost > 0
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_active_count > 0 THEN
      v_new_cost := ROUND(v_total_cost / v_active_count, 2);

      UPDATE public.plan_participants
         SET cost_per_participant = v_new_cost,
             updated_at           = now()
       WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_waitlist_to_going(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. remove_participant RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id             UUID;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
  v_target_assigned_group assigned_group_enum;
  v_filtering_mode        participant_filtering_type;
  v_max_participants      INT;
  v_promoted_count        INT := 0;
  v_remaining_hosts       INT;
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
  SELECT role, rsvp_status, assigned_group 
    INTO v_target_role, v_target_status, v_target_assigned_group
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

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant
  UPDATE public.plan_participants
     SET rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'REMOVED'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         role              = 'PARTICIPANT'::participant_role,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

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
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. replace_participant RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.replace_participant(p_plan_id uuid, p_target_user_id uuid, p_replacement_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id              UUID;
  v_target_row             RECORD;
  v_replacement_row        RECORD;
  v_replacement_found      BOOLEAN := FALSE;
  v_target_was_going       BOOLEAN := FALSE;
  v_replacement_prev_pos   INT := NULL;
  v_filtering_mode         participant_filtering_type;
  v_remaining_hosts        INT;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller host authorization
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can replace participants' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Lock target participant row
  SELECT role, assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot replace the last active host
  IF v_target_row.role = 'HOST'::participant_role AND v_target_row.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot replace the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  v_target_was_going := (v_target_row.assigned_group = 'GOING'::assigned_group_enum OR v_target_row.rsvp_status = 'JOINED'::rsvp_status);

  -- 4. Check if replacement participant is already in plan_participants
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
   FOR UPDATE;

  v_replacement_found := FOUND;

  -- 5. Transition target participant
  UPDATE public.plan_participants
     SET role               = 'PARTICIPANT'::participant_role,
         rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'REPLACED'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 6. Transition or Insert replacement participant
  IF v_replacement_found THEN
    v_replacement_prev_pos := v_replacement_row.waitlist_position;

    IF (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_row.assigned_group = 'WAITLIST'::assigned_group_enum) OR
       (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_row.rsvp_status IN ('WAITLISTED'::rsvp_status)) THEN
       
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = CASE
                                     WHEN rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                     WHEN rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                                     ELSE rsvp_status
                                   END,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    ELSE
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = 'INVITED'::rsvp_status,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
    END IF;

  ELSE
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      skip_reason
    ) VALUES (
      p_plan_id,
      p_replacement_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      CASE WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      NULL,
      NULL
    );
  END IF;

  -- 7. Renumber waitlist positions if replacement was on waitlist
  IF v_replacement_prev_pos IS NOT NULL THEN
    WITH renumbered AS (
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC) AS new_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND waitlist_position IS NOT NULL
    )
    UPDATE public.plan_participants p
       SET waitlist_position = r.new_pos
      FROM renumbered r
     WHERE p.plan_id = p_plan_id AND p.user_id = r.user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'replacement_user_id', p_replacement_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.replace_participant(UUID, UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. request_paid_plan_leave RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_paid_plan_leave(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id            UUID;
  v_total_cost         NUMERIC;
  v_current_rsvp       rsvp_status;
  v_current_role       participant_role;
  v_leave_requested    BOOLEAN;
  v_activity_id        UUID;
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

  -- If user is a host, they cannot request leave if they are the sole active host
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

  INSERT INTO public.plan_activity (
    plan_id, actor_id, target_user_id, activity_type, metadata
  ) VALUES (
    p_plan_id,
    v_user_id,
    v_user_id,
    'participant_left'::plan_activity_type,
    jsonb_build_object('status', 'PENDING', 'requested_at', now())
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', true,
    'activity_id', v_activity_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_paid_plan_leave(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. resolve_paid_plan_leave_request RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_paid_plan_leave_request(p_plan_id uuid, p_target_user_id uuid, p_resolution text, p_replacement_user_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id                  UUID;
  v_filtering_mode             participant_filtering_type;
  v_max_participants           INT;
  v_target_rsvp                rsvp_status;
  v_target_leave_req           BOOLEAN;
  v_target_assigned_group      assigned_group_enum;
  v_activity_id                UUID;
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

  SELECT id INTO v_activity_id
    FROM public.plan_activity
   WHERE plan_id = p_plan_id
     AND target_user_id = p_target_user_id
     AND activity_type = 'leave_requested'::plan_activity_type
     AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING')
   ORDER BY created_at DESC
   LIMIT 1;

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

    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'REPLACED',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
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

    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'KEEP_PAYMENT',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;

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
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END, NULL
      );
    ELSE
      IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        UPDATE public.plan_participants
           SET assigned_group     = v_target_assigned_group,
               rsvp_status        = CASE 
                                      WHEN rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                      WHEN rsvp_status = 'WAITLISTED'::rsvp_status AND v_target_assigned_group = 'GOING'::assigned_group_enum THEN 'JOINED'::rsvp_status 
                                      ELSE rsvp_status 
                                    END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);
      ELSE
        UPDATE public.plan_participants
           SET rsvp_status        = 'INVITED'::rsvp_status,
               assigned_group     = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'resolution',          p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_paid_plan_leave_request(UUID, UUID, TEXT, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. update_plan_capacity RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_plan_capacity(p_plan_id uuid, p_max_participants integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id        UUID;
  v_filtering      TEXT;
  v_promoted_count INT := 0;
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

  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    SELECT COUNT(*) INTO v_promoted_count
      FROM public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_capacity', p_max_participants,
    'promoted_count', v_promoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. update_cost_expense RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_cost_expense(p_expense_id uuid, p_title text, p_total_amount numeric, p_plan_id uuid, p_participant_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     UUID;
  v_payer_id      UUID;
  v_message_id    UUID;
  v_old_title     TEXT;
  v_expense_type  wallet_expense_type;
  v_count         INT;
  v_share         NUMERIC;
  v_pid           UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id, message_id, title, expense_type
    INTO v_payer_id, v_message_id, v_old_title, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be the expense payer OR an active plan host
  IF v_caller_id <> v_payer_id AND NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this expense' USING ERRCODE = '40300';
  END IF;

  v_count := array_length(p_participant_ids, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'At least one participant is required' USING ERRCODE = '40000';
  END IF;

  v_share := ROUND((p_total_amount / v_count)::numeric, 2);

  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.wallet_expenses
     SET title = p_title,
         total_amount = p_total_amount,
         plan_id = p_plan_id,
         updated_at = NOW()
   WHERE id = p_expense_id;

  IF v_expense_type = 'PLAN_EXPENSE' OR (v_message_id IS NULL AND (v_old_title = 'Plan Fee' OR v_old_title = 'Plan Expense')) THEN
    UPDATE public.plans
       SET total_cost = p_total_amount,
           updated_at = NOW()
     WHERE id = p_plan_id;
  END IF;

  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id
     AND status != 'SETTLED'
     AND user_id != ALL(p_participant_ids);

  FOREACH v_pid IN ARRAY p_participant_ids LOOP
    INSERT INTO public.wallet_expense_participants (
      expense_id,
      user_id,
      amount_owed,
      amount_paid,
      status,
      created_at,
      updated_at
    )
    VALUES (
      p_expense_id,
      v_pid,
      v_share,
      0,
      'PENDING',
      NOW(),
      NOW()
    )
    ON CONFLICT (expense_id, user_id) DO UPDATE
       SET amount_owed = EXCLUDED.amount_owed,
           status = CASE 
                      WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                      ELSE EXCLUDED.status
                    END,
           updated_at = NOW();
  END LOOP;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'total_amount', p_total_amount,
    'share', v_share
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_cost_expense(UUID, TEXT, NUMERIC, UUID, UUID[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. remove_expense_participant_and_redistribute RPC (Both Overloads)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_expense_participant_and_redistribute(p_expense_id uuid, p_participant_user_id uuid, p_strategy text DEFAULT 'SPLIT_SHARE'::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id       UUID;
  v_payer_id        UUID;
  v_plan_id         UUID;
  v_total_amount    NUMERIC;
  v_expense_type    wallet_expense_type;
  v_pt_status       TEXT;
  v_pt_name         TEXT;
  v_remaining_count INT;
  v_base_share      NUMERIC;
  v_remainder       NUMERIC;
  v_new_total       NUMERIC := 0;
  v_curr_idx        INT := 0;
  v_rec             RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id, plan_id, message_id, title, total_amount, expense_type
    INTO v_payer_id, v_plan_id, v_rec.message_id, v_rec.title, v_total_amount, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be the expense payer OR an active plan host
  IF v_caller_id <> v_payer_id AND (v_plan_id IS NULL OR NOT public.is_plan_host(v_plan_id, v_caller_id)) THEN
    RAISE EXCEPTION 'Not authorized to modify this expense' USING ERRCODE = '40300';
  END IF;

  SELECT status INTO v_pt_status
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant is not part of this expense' USING ERRCODE = '40400';
  END IF;

  SELECT COALESCE(full_name, username, 'Participant') INTO v_pt_name
    FROM public.users WHERE id = p_participant_user_id;

  IF UPPER(COALESCE(v_pt_status, 'PENDING')) = 'SETTLED' THEN
    RAISE EXCEPTION 'Cannot remove settled split. % has already settled this expense.', v_pt_name USING ERRCODE = '40000';
  END IF;

  SELECT COUNT(*) INTO v_remaining_count
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id != p_participant_user_id;

  IF v_remaining_count <= 0 THEN
    RAISE EXCEPTION 'An expense must have at least one participant.' USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  IF UPPER(COALESCE(p_strategy, 'SPLIT_SHARE')) = 'KEEP_SAME_SHARE' THEN
    SELECT COALESCE(SUM(amount_owed), 0) INTO v_new_total
      FROM public.wallet_expense_participants
     WHERE expense_id = p_expense_id;

    UPDATE public.wallet_expenses
       SET total_amount = v_new_total,
           updated_at = NOW()
     WHERE id = p_expense_id;

    IF v_expense_type = 'PLAN_EXPENSE' OR (v_rec.message_id IS NULL AND (v_rec.title = 'Plan Fee' OR v_rec.title = 'Plan Expense')) THEN
      UPDATE public.plans
         SET total_cost = v_new_total,
             updated_at = NOW()
       WHERE id = v_plan_id;
    END IF;
  ELSE
    v_base_share := TRUNC((v_total_amount / v_remaining_count)::numeric, 2);
    v_remainder := v_total_amount - (v_base_share * v_remaining_count);

    FOR v_rec IN 
      SELECT user_id FROM public.wallet_expense_participants
       WHERE expense_id = p_expense_id
       ORDER BY created_at ASC, user_id ASC
    LOOP
      v_curr_idx := v_curr_idx + 1;
      UPDATE public.wallet_expense_participants
         SET amount_owed = v_base_share + (CASE WHEN v_curr_idx = 1 THEN v_remainder ELSE 0 END),
             updated_at = NOW()
       WHERE expense_id = p_expense_id AND user_id = v_rec.user_id;
    END LOOP;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'removed_user_id', p_participant_user_id,
    'strategy', p_strategy,
    'remaining_count', v_remaining_count,
    'total_amount', CASE WHEN UPPER(COALESCE(p_strategy, 'SPLIT_SHARE')) = 'KEEP_SAME_SHARE' THEN v_new_total ELSE v_total_amount END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_expense_participant_and_redistribute(p_expense_id uuid, p_participant_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.remove_expense_participant_and_redistribute(p_expense_id, p_participant_user_id, 'SPLIT_SHARE'::text);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_expense_participant_and_redistribute(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_expense_participant_and_redistribute(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. recalculate_wallet_expenses RPC
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_wallet_expenses(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_cost       NUMERIC;
  v_host_id          UUID;
  v_existing_payer   UUID;
  v_max_participants INTEGER;
  v_share            NUMERIC;
  v_expense_id       UUID;
BEGIN
  SELECT total_cost, max_participants
  INTO v_total_cost, v_max_participants
  FROM public.plans WHERE id = p_plan_id;

  -- Clear legacy cost_per_participant
  UPDATE public.plan_participants SET cost_per_participant = NULL WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    DELETE FROM public.wallet_expenses 
    WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'));
    RETURN;
  END IF;

  -- Determine payer:
  -- 1. Preserve existing payer on PLAN_EXPENSE if already established
  SELECT payer_id INTO v_existing_payer
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'))
  LIMIT 1;

  IF v_existing_payer IS NOT NULL THEN
    v_host_id := v_existing_payer;
  ELSE
    -- 2. Pick the earliest joined active HOST
    SELECT user_id INTO v_host_id
    FROM public.plan_participants
    WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
    ORDER BY created_at ASC
    LIMIT 1;

    -- 3. Fallback to plans.host_id during compatibility phase
    IF v_host_id IS NULL THEN
      SELECT host_id INTO v_host_id FROM public.plans WHERE id = p_plan_id;
    END IF;
  END IF;

  IF v_host_id IS NULL THEN RETURN; END IF;

  -- Determine share amount
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM public.plan_participants
    WHERE plan_id = p_plan_id 
      AND rsvp_status = 'JOINED';
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  -- Update legacy cost_per_participant for JOINED participants only
  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id 
    AND rsvp_status = 'JOINED';

  -- Upsert single plan-level PLAN_EXPENSE wallet_expense
  SELECT id INTO v_expense_id FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee')) LIMIT 1;

  IF v_expense_id IS NULL THEN
    INSERT INTO public.wallet_expenses (plan_id, payer_id, title, total_amount, status, expense_type)
    VALUES (p_plan_id, v_host_id, 'Plan Fee', v_total_cost, 'PENDING', 'PLAN_EXPENSE')
    RETURNING id INTO v_expense_id;
  ELSE
    UPDATE public.wallet_expenses
    SET total_amount = v_total_cost, expense_type = 'PLAN_EXPENSE', updated_at = NOW()
    WHERE id = v_expense_id;
  END IF;

  -- Remove participant rows for users no longer in JOINED, EXCEPT PRESERVE SETTLED AND PAYMENT_KEPT RECORDS
  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND (
          rsvp_status = 'JOINED'
          OR (rsvp_status = 'SKIPPED' AND skip_reason = 'PAYMENT_KEPT')
        )
    );

  -- Upsert participant shares for all JOINED participants
  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        updated_at = NOW();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalculate_wallet_expenses(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. Triggers: Reset Host Role on Waitlist/Skip & Activity Logging
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_reset_waitlisted_or_skipped_host_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Any host participant automatically reverts to PARTICIPANT if WAITLISTED or SKIPPED
  IF NEW.role = 'HOST'::participant_role AND (NEW.rsvp_status = 'WAITLISTED'::rsvp_status OR NEW.rsvp_status = 'SKIPPED'::rsvp_status) THEN
    NEW.role := 'PARTICIPANT'::participant_role;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_plan_lifecycle_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor_id UUID;
BEGIN
  v_actor_id := COALESCE(auth.uid(), NEW.host_id);

  -- INSERT (Plan Creation)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (
      NEW.id,
      v_actor_id,
      v_actor_id,
      'plan_created'::plan_activity_type,
      jsonb_build_object('title', NEW.title)
    );
    RETURN NEW;
  END IF;

  -- UPDATE (Plan Property Changes)
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.place_name IS DISTINCT FROM NEW.place_name THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_location_changed'::plan_activity_type,
        jsonb_build_object('new_location', NEW.place_name)
      );
    END IF;

    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_datetime_changed'::plan_activity_type,
        jsonb_build_object('old_scheduled_at', OLD.scheduled_at, 'new_scheduled_at', NEW.scheduled_at)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_effective_actor_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status OR OLD.assigned_group IS DISTINCT FROM NEW.assigned_group) THEN

    IF (auth.uid() IS NOT NULL AND auth.uid() != NEW.user_id) OR current_setting('app.system_op', true) = 'true' THEN
      -- HOST / SYSTEM MOVEMENT
      v_effective_actor_id := COALESCE(
        NULLIF(auth.uid(), NEW.user_id),
        (SELECT user_id FROM public.plan_participants WHERE plan_id = NEW.plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status ORDER BY created_at ASC LIMIT 1),
        NEW.user_id
      );

      IF (NEW.assigned_group = 'GOING' AND OLD.assigned_group IS DISTINCT FROM 'GOING') OR 
         (NEW.rsvp_status = 'JOINED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'JOINED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_joined'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'joined'
          )
        );

      ELSIF (NEW.assigned_group = 'WAITLIST' AND OLD.assigned_group IS DISTINCT FROM 'WAITLIST') OR 
            (NEW.rsvp_status = 'WAITLISTED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'WAITLISTED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_waitlist'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'waitlist'
          )
        );

      ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'SKIPPED'::rsvp_status THEN
        IF NEW.skip_reason = 'REMOVED'::skip_reason THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            v_effective_actor_id,
            NEW.user_id,
            'participant_removed'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.skip_reason = 'REPLACED'::skip_reason THEN
          NULL;
        END IF;
      END IF;

    ELSE
      -- VOLUNTARY PARTICIPANT ACTIONS
      IF OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
        IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_joined'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_waitlisted'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
          IF NEW.skip_reason = 'REPLACED'::skip_reason THEN
            NULL;
          ELSIF OLD.rsvp_status = 'INVITED'::rsvp_status THEN
            INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
            VALUES (
              NEW.plan_id,
              NEW.user_id,
              NEW.user_id,
              'participant_skipped'::plan_activity_type,
              '{}'::jsonb
            );
          ELSE
            INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
            VALUES (
              NEW.plan_id,
              NEW.user_id,
              NEW.user_id,
              'participant_left'::plan_activity_type,
              jsonb_build_object('resolution', NEW.skip_reason)
            );
          END IF;
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. RLS Policies Migration
-- ─────────────────────────────────────────────────────────────────────────────

-- 19.1 plans
DROP POLICY IF EXISTS "Allow hosts to update plans" ON public.plans;
CREATE POLICY "Allow hosts to update plans" 
ON public.plans 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants pp
    WHERE pp.plan_id = plans.id
      AND pp.user_id = auth.uid()
      AND pp.role = 'HOST'::participant_role
      AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.plan_participants pp
    WHERE pp.plan_id = plans.id
      AND pp.user_id = auth.uid()
      AND pp.role = 'HOST'::participant_role
      AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
);

-- 19.2 plan_activity
DROP POLICY IF EXISTS "Allow authenticated users to insert plan_activity" ON public.plan_activity;
CREATE POLICY "Allow authenticated users to insert plan_activity" 
ON public.plan_activity 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.plan_participants pp
    WHERE pp.plan_id = plan_activity.plan_id
      AND pp.user_id = auth.uid()
  )
);

-- 19.3 plan_invites
DROP POLICY IF EXISTS "Allow hosts to insert plan invites" ON public.plan_invites;
CREATE POLICY "Allow hosts to insert plan invites" 
ON public.plan_invites 
FOR INSERT 
TO authenticated 
WITH CHECK (
  (auth.uid() = created_by) AND (
    EXISTS (
      SELECT 1 FROM public.plan_participants pp
      WHERE pp.plan_id = plan_invites.plan_id
        AND pp.user_id = auth.uid()
        AND pp.role = 'HOST'::participant_role
        AND pp.rsvp_status = 'JOINED'::rsvp_status
    )
  )
);

DROP POLICY IF EXISTS "Allow hosts to update plan invites" ON public.plan_invites;
CREATE POLICY "Allow hosts to update plan invites" 
ON public.plan_invites 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants pp
    WHERE pp.plan_id = plan_invites.plan_id
      AND pp.user_id = auth.uid()
      AND pp.role = 'HOST'::participant_role
      AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.plan_participants pp
    WHERE pp.plan_id = plan_invites.plan_id
      AND pp.user_id = auth.uid()
      AND pp.role = 'HOST'::participant_role
      AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
);

-- 19.4 wallet_expense_participants
DROP POLICY IF EXISTS "wallet_expense_participants_delete" ON public.wallet_expense_participants;
CREATE POLICY "wallet_expense_participants_delete" 
ON public.wallet_expense_participants 
FOR DELETE 
TO authenticated 
USING (
  (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND we.payer_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND public.is_plan_host(we.plan_id, auth.uid())
  ))
);

DROP POLICY IF EXISTS "wallet_expense_participants_insert" ON public.wallet_expense_participants;
CREATE POLICY "wallet_expense_participants_insert" 
ON public.wallet_expense_participants 
FOR INSERT 
TO authenticated 
WITH CHECK (
  (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND we.payer_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND public.is_plan_host(we.plan_id, auth.uid())
  ))
);

DROP POLICY IF EXISTS "wallet_expense_participants_select" ON public.wallet_expense_participants;
CREATE POLICY "wallet_expense_participants_select" 
ON public.wallet_expense_participants 
FOR SELECT 
TO authenticated 
USING (
  (user_id = auth.uid())
  OR public.is_expense_participant(expense_id, auth.uid())
  OR (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND we.payer_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND public.is_plan_host(we.plan_id, auth.uid())
  ))
);

DROP POLICY IF EXISTS "wallet_expense_participants_update" ON public.wallet_expense_participants;
CREATE POLICY "wallet_expense_participants_update" 
ON public.wallet_expense_participants 
FOR UPDATE 
TO authenticated 
USING (
  (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND we.payer_id = auth.uid()
  ))
  OR (EXISTS (
    SELECT 1 FROM public.wallet_expenses we
    WHERE we.id = wallet_expense_participants.expense_id AND public.is_plan_host(we.plan_id, auth.uid())
  ))
);
