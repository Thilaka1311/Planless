-- Migration: Fix complete_plan RPC expense recalculation and align plan_size
-- 1. Eliminates references to non-existent 'split_type' enum and invalid columns 'share_amount'/'initial_share'
-- 2. Sets final plan_size = v_final_count (attended participants count) on plan completion
-- 3. Preserves actual cost per person under KEEP_CURRENT_COST mode: final_total = cost_per_person * final_count
-- 4. Ensures manage_completed_plan_participants also keeps plan_size synchronized with attended count

CREATE OR REPLACE FUNCTION public.complete_plan(
  p_plan_id uuid,
  p_attendance_input jsonb,
  p_expense_mode text DEFAULT 'NONE'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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
      plan_size = v_final_count,
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
    'plan_size', v_final_count,
    'final_count', v_final_count,
    'total_cost', v_final_total_cost,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );
END;
$$;

ALTER FUNCTION public.complete_plan(uuid, jsonb, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb, text) TO service_role;

-- Overload for backwards compatibility
CREATE OR REPLACE FUNCTION public.complete_plan(
  p_plan_id uuid,
  p_attendance_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.complete_plan(p_plan_id, p_attendance_input, 'NONE'::text);
END;
$$;

ALTER FUNCTION public.complete_plan(uuid, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb) TO service_role;

-- Update manage_completed_plan_participants to also keep plan_size synchronized with final attended count
CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(
  p_plan_id uuid,
  p_users_to_add uuid[] DEFAULT NULL::uuid[],
  p_users_to_remove uuid[] DEFAULT NULL::uuid[],
  p_expense_mode text DEFAULT 'NONE'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
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

    IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
      IF v_old_plan_size IS NOT NULL AND v_old_plan_size > 0 THEN
        v_initial_share := ROUND((v_initial_total_cost / v_old_plan_size)::numeric, 2);
      ELSIF v_initial_attendee_count > 0 THEN
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

  SELECT count(*) INTO v_final_invited
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND rsvp_status != 'SKIPPED'::rsvp_status;

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

  -- 8. Update plan totals & counts (including plan_size = v_final_count)
  UPDATE public.plans
  SET
    attended_participants = v_final_count,
    plan_size = v_final_count,
    invited_participants = v_final_invited,
    total_cost = coalesce(v_new_total_cost, total_cost),
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'invited_participants', v_final_invited,
    'attended_participants', v_final_count,
    'plan_size', v_final_count,
    'total_cost', coalesce(v_new_total_cost, v_initial_total_cost),
    'final_count', v_final_count
  );
END;
$$;

ALTER FUNCTION public.manage_completed_plan_participants(uuid, uuid[], uuid[], text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(uuid, uuid[], uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(uuid, uuid[], uuid[], text) TO service_role;
