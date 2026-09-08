-- Migration: Update manage_completed_plan_participants RPC
-- Description: Adds expense mode choice (SPLIT_ALL, KEEP_CURRENT_COST, NONE) and defaults for array parameters.

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
  v_target_user_id UUID;
  v_final_count INT;
  v_participant RECORD;
  v_plan_expense RECORD;
  v_share NUMERIC;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan and host
  SELECT host_id, status
  INTO v_host_id, v_plan_status
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; -- Lock plan row

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 3. Process Additions
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
        'PARTICIPANT'::plan_participant_role,
        'JOINED'::rsvp_status,
        'ATTENDED'::attendance_status,
        'JOINED'::rsvp_status,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE
      SET rsvp_status = 'JOINED'::rsvp_status,
          final_attendance = 'ATTENDED'::attendance_status,
          final_state = 'JOINED'::rsvp_status,
          skip_reason = NULL,
          updated_at = now();
    END LOOP;
  END IF;

  -- 4. Process Removals
  IF p_users_to_remove IS NOT NULL AND array_length(p_users_to_remove, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove LOOP
      -- Fetch current participant record
      SELECT skip_reason INTO v_participant
      FROM public.plan_participants
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id
      FOR UPDATE;
      
      IF FOUND THEN
        UPDATE public.plan_participants
        SET rsvp_status = 'SKIPPED'::rsvp_status,
            final_attendance = 'DID_NOT_ATTEND'::attendance_status,
            final_state = 'SKIPPED'::rsvp_status,
            skip_reason = COALESCE(v_participant.skip_reason, 'REMOVED'),
            updated_at = now()
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
      END IF;
    END LOOP;
  END IF;

  -- 5. Calculate Final Attended Count
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 6. Handle Plan Expense Recalculation
  IF p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') AND v_final_count > 0 THEN
    -- Find plan expense
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id
      AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_plan_expense.id IS NOT NULL THEN
      
      IF p_expense_mode = 'SPLIT_ALL' THEN
        v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
      ELSIF p_expense_mode = 'KEEP_CURRENT_COST' THEN
        -- Pick a valid, non-zero amount if possible from an existing participant
        SELECT amount_owed INTO v_share
        FROM public.wallet_expense_participants
        WHERE expense_id = v_plan_expense.id AND amount_owed > 0
        ORDER BY amount_owed DESC
        LIMIT 1;

        -- Fallback if no valid existing row is found
        IF v_share IS NULL OR v_share <= 0 THEN
          v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        END IF;

        -- Increase total amount based on the new final count
        UPDATE public.wallet_expenses
        SET total_amount = v_share * v_final_count,
            updated_at = NOW()
        WHERE id = v_plan_expense.id;
      END IF;
      
      -- Fallback safety check
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
          -- Ensure participants who didn't attend have no remaining obligation
          -- (Preserving existing SETTLED records and explicitly preserving PAYMENT_KEPT)
          DELETE FROM public.wallet_expense_participants wep
          WHERE wep.expense_id = v_plan_expense.id 
            AND wep.user_id = v_participant.user_id
            AND wep.status != 'SETTLED'
            AND NOT EXISTS (
              SELECT 1 FROM public.plan_participants pp
              WHERE pp.plan_id = p_plan_id 
                AND pp.user_id = v_participant.user_id 
                AND pp.skip_reason = 'PAYMENT_KEPT'
            );
        END IF;
      END LOOP;

    END IF;
  END IF;

  -- Ensure plans.total_cost matches the final expense total_amount if applicable
  IF v_plan_expense.id IS NOT NULL AND p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') THEN
    UPDATE public.plans
    SET total_cost = (
      SELECT total_amount FROM public.wallet_expenses WHERE id = v_plan_expense.id
    )
    WHERE id = p_plan_id;
  END IF;

  -- 7. Update max_participants on plan
  UPDATE public.plans
  SET max_participants = v_final_count,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'final_count', v_final_count
  );

END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_completed_plan_participants(UUID, UUID[], UUID[], TEXT) TO authenticated;
