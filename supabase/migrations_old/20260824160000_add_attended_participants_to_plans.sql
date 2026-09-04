-- Migration: Add attended_participants column to plans & update complete_plan RPC
-- Description: Adds plans.attended_participants, backfills existing COMPLETED plans, and updates complete_plan RPC to persist attended_participants without modifying max_participants.

-- 1. Add attended_participants column
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS attended_participants INTEGER NOT NULL DEFAULT 0;

-- 2. Add non-negative constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_attended_participants_nonnegative'
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT check_attended_participants_nonnegative CHECK (attended_participants >= 0);
  END IF;
END $$;

-- 3. Safely backfill completed plans from plan_participants
UPDATE public.plans p
SET attended_participants = COALESCE((
  SELECT COUNT(*)
  FROM public.plan_participants pp
  WHERE pp.plan_id = p.id
    AND (
      pp.final_attendance = 'ATTENDED'::attendance_status
      OR (pp.final_attendance IS NULL AND pp.rsvp_status = 'JOINED'::rsvp_status)
    )
), 0)
WHERE p.status = 'COMPLETED'::plan_status;

-- 4. Update complete_plan RPC (keeping max_participants completely UNTOUCHED)
CREATE OR REPLACE FUNCTION public.complete_plan(
  p_plan_id UUID,
  p_attendance_input JSONB,
  p_expense_mode TEXT DEFAULT 'NONE'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id UUID;
  v_host_id UUID;
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
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan and host
  SELECT host_id, status, scheduled_at, rsvp_deadline
  INTO v_host_id, v_plan_status, v_scheduled_at, v_rsvp_deadline
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; -- Lock plan row to prevent concurrent completions

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_ALREADY_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 3. Validate attendance input
  IF jsonb_typeof(p_attendance_input) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE_FORMAT' USING ERRCODE = '40000';
  END IF;

  -- Auto-insert any newly added attendees (e.g. friends selected via Attendance Search)
  -- who are marked as ATTENDED and do not yet exist in plan_participants.
  INSERT INTO public.plan_participants (
    plan_id,
    user_id,
    rsvp_status,
    final_attendance,
    final_state,
    created_at,
    updated_at
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

  -- Check if host is marked absent
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_host_id
      AND (item->>'attendance') = 'DID_NOT_ATTEND'
  ) THEN
    RAISE EXCEPTION 'HOST_CANNOT_BE_MARKED_ABSENT' USING ERRCODE = '40000';
  END IF;

  -- 4. Finalize attendance for all participants
  FOR v_participant IN
    SELECT user_id, rsvp_status, skip_reason
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
    FOR UPDATE
  LOOP
    SELECT (item->>'attendance')::attendance_status
    INTO v_input_attendance
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_participant.user_id;

    IF v_participant.user_id = v_host_id THEN
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
      IF v_participant.rsvp_status = 'JOINED'::rsvp_status THEN
        v_final_attendance := 'ATTENDED'::attendance_status;
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_attendance := 'DID_NOT_ATTEND'::attendance_status;
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;
    END IF;

    UPDATE public.plan_participants
    SET final_attendance = v_final_attendance,
        final_state = v_final_state,
        updated_at = now()
    WHERE plan_id = p_plan_id AND user_id = v_participant.user_id;
  END LOOP;

  -- 5. Calculate Final Attended Count from plan_participants
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 6. Handle Plan Expense Recalculation if Expense Mode is specified
  IF p_expense_mode IN ('SPLIT_ALL', 'CHARGE_NEW_ONLY') AND v_final_count > 0 THEN
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id
      AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_plan_expense IS NOT NULL THEN
      v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);

      IF p_expense_mode = 'SPLIT_ALL' THEN
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
                updated_at = now();
          ELSE
            UPDATE public.wallet_expense_participants
            SET amount_owed = 0,
                status = 'SKIPPED',
                updated_at = now()
            WHERE expense_id = v_plan_expense.id AND user_id = v_participant.user_id;
          END IF;
        END LOOP;

      ELSIF p_expense_mode = 'CHARGE_NEW_ONLY' THEN
        FOR v_participant IN
          SELECT user_id
          FROM public.plan_participants
          WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.wallet_expense_participants
            WHERE expense_id = v_plan_expense.id AND user_id = v_participant.user_id
          ) THEN
            INSERT INTO public.wallet_expense_participants (
              expense_id, user_id, amount_owed, amount_paid, status, created_at, updated_at
            )
            VALUES (
              v_plan_expense.id, v_participant.user_id, v_share, 0, 'PENDING', now(), now()
            )
            ON CONFLICT (expense_id, user_id) DO NOTHING;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- 7. Update Plan Status & attended_participants ONLY (CRITICAL: max_participants is UNTOUCHED!)
  IF now() < v_scheduled_at THEN
    v_scheduled_at := now();
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      attended_participants = v_final_count,
      scheduled_at = v_scheduled_at,
      rsvp_deadline = v_rsvp_deadline,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'COMPLETED',
    'attended_participants', v_final_count,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_plan(UUID, JSONB, TEXT) TO authenticated;
