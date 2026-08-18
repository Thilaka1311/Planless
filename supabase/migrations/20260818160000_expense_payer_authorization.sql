-- Migration: Expense Payer Authorization RPCs (Edit & Delete)
-- Description: Enforces strict payer-only authorization for deleting and editing wallet expenses at the RPC database layer.

-- 1. Update delete_wallet_expense to strictly require caller = payer_id
CREATE OR REPLACE FUNCTION public.delete_wallet_expense(
  p_expense_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id     UUID;
  v_payer_id      UUID;
  v_plan_id       UUID;
  v_message_id    UUID;
  v_title         TEXT;
BEGIN
  -- Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Fetch expense details
  SELECT plan_id, message_id, payer_id, title
    INTO v_plan_id, v_message_id, v_payer_id, v_title
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Protect default Plan Fee expenses
  IF v_message_id IS NULL AND v_title = 'Plan Fee' THEN
    RAISE EXCEPTION 'Cannot delete default plan fee expense' USING ERRCODE = '40300';
  END IF;

  -- Strict authorization: Caller MUST be the expense payer/creator
  IF v_caller_id != v_payer_id THEN
    RAISE EXCEPTION 'Not authorized to delete this expense' USING ERRCODE = '40300';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Delete associated wallet_expense_participants
  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id;

  -- Delete wallet_expense row
  DELETE FROM public.wallet_expenses
   WHERE id = p_expense_id;

  -- Clean up associated plan_messages row if message_id is present
  IF v_message_id IS NOT NULL THEN
    DELETE FROM public.plan_messages
     WHERE id = v_message_id;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'plan_id', v_plan_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_wallet_expense(UUID) TO authenticated;

-- 2. Create update_cost_expense RPC enforcing strict caller = payer_id check
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
  v_count         INT;
  v_share         NUMERIC;
  v_pid           UUID;
BEGIN
  -- Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Fetch expense details
  SELECT payer_id, message_id, title
    INTO v_payer_id, v_message_id, v_old_title
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Protect default Plan Fee expenses
  IF v_message_id IS NULL AND v_old_title = 'Plan Fee' THEN
    RAISE EXCEPTION 'Cannot edit default plan fee expense' USING ERRCODE = '40300';
  END IF;

  -- Strict authorization: Caller MUST be the expense payer/creator
  IF v_caller_id != v_payer_id THEN
    RAISE EXCEPTION 'Not authorized to edit this expense' USING ERRCODE = '40300';
  END IF;

  -- Calculate split share
  v_count := array_length(p_participant_ids, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'At least one participant is required' USING ERRCODE = '40000';
  END IF;

  v_share := ROUND((p_total_amount / v_count)::numeric, 2);

  PERFORM set_config('app.system_op', 'true', true);

  -- Update wallet_expenses
  UPDATE public.wallet_expenses
     SET title = p_title,
         total_amount = p_total_amount,
         plan_id = p_plan_id,
         updated_at = NOW()
   WHERE id = p_expense_id;

  -- Remove participant rows no longer included
  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id
     AND user_id != ALL(p_participant_ids);

  -- Upsert active participant rows
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
