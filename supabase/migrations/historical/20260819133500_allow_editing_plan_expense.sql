-- Migration: Allow editing Plan Expense and sync back to plans.total_cost
-- Description: Removes 40300 restriction blocking Plan Expense edits, synchronizes plans.total_cost for PLAN_EXPENSE edits, and preserves settlement status and PAYMENT_KEPT.

CREATE OR REPLACE FUNCTION public.update_cost_expense(
  p_expense_id      UUID,
  p_title           TEXT,
  p_total_amount    NUMERIC,
  p_plan_id         UUID,
  p_participant_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id     UUID;
  v_payer_id      UUID;
  v_message_id    UUID;
  v_old_title     TEXT;
  v_expense_type  wallet_expense_type;
  v_plan_host_id  UUID;
  v_count         INT;
  v_share         NUMERIC;
  v_pid           UUID;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch expense details & plan host
  SELECT payer_id, message_id, title, expense_type
    INTO v_payer_id, v_message_id, v_old_title, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  SELECT host_id INTO v_plan_host_id
    FROM public.plans
   WHERE id = p_plan_id;

  -- 3. Authorization check: Caller must be the expense payer OR the plan host
  IF v_caller_id != v_payer_id AND (v_plan_host_id IS NULL OR v_caller_id != v_plan_host_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this expense' USING ERRCODE = '40300';
  END IF;

  -- 4. Calculate split share
  v_count := array_length(p_participant_ids, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'At least one participant is required' USING ERRCODE = '40000';
  END IF;

  v_share := ROUND((p_total_amount / v_count)::numeric, 2);

  PERFORM set_config('app.system_op', 'true', true);

  -- 5. Update wallet_expenses record
  UPDATE public.wallet_expenses
     SET title = p_title,
         total_amount = p_total_amount,
         plan_id = p_plan_id,
         updated_at = NOW()
   WHERE id = p_expense_id;

  -- 6. If this is a PLAN_EXPENSE, sync back to plans.total_cost
  IF v_expense_type = 'PLAN_EXPENSE' OR (v_message_id IS NULL AND (v_old_title = 'Plan Fee' OR v_old_title = 'Plan Expense')) THEN
    UPDATE public.plans
       SET total_cost = p_total_amount,
           updated_at = NOW()
     WHERE id = p_plan_id;
  END IF;

  -- 7. Remove participant rows no longer included, EXCEPT PRESERVING SETTLED RECORDS
  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id
     AND status != 'SETTLED'
     AND user_id != ALL(p_participant_ids);

  -- 8. Upsert active participant rows, PRESERVING existing 'SETTLED' status
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
$$;

GRANT EXECUTE ON FUNCTION public.update_cost_expense(UUID, TEXT, NUMERIC, UUID, UUID[]) TO authenticated;
