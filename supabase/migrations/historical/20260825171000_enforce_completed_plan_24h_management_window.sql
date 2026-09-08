-- Migration: Enforce 24-hour participant management window for completed plans
-- Description: Adds a server-side check to manage_completed_plan_participants RPC to reject any mutations executed 24 hours or more after the plan's scheduled_at timestamp.

CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(
  p_plan_id UUID,
  p_users_to_add UUID[] DEFAULT '{}',
  p_users_to_remove UUID[] DEFAULT '{}',
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
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan and host (Lock plan row)
  SELECT host_id, status, total_cost, scheduled_at
  INTO v_host_id, v_plan_status, v_initial_total_cost, v_scheduled_at
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
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
    -- Read existing per-person share from wallet_expense_participants or calculate from initial total & attendee count
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
      -- Ensure caller is not trying to remove the host
      IF v_target_user_id != v_host_id THEN
        UPDATE public.plan_participants
        SET
          rsvp_status = 'SKIPPED'::rsvp_status,
          final_attendance = 'DID_NOT_ATTEND'::attendance_status,
          final_state = 'SKIPPED'::rsvp_status,
          updated_at = now()
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
      END IF;
    END LOOP;
  END IF;

  -- 6. Authoritative Final Attendance & Capacity Calculation
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT GREATEST(coalesce(max_participants, 1), count(*)::int) INTO v_new_max_participants
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND (rsvp_status = 'JOINED' OR final_attendance = 'ATTENDED'::attendance_status);

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
        -- Preserve payment kept obligations
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
$$;

GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(UUID, UUID[], UUID[], TEXT) TO authenticated;
