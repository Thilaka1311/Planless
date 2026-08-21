-- Migration: Unsettle Wallet Expense Participant RPC
-- Description: Creates SECURITY DEFINER RPC unsettle_wallet_expense to reverse a participant's settlement state back to PENDING.

CREATE OR REPLACE FUNCTION public.unsettle_wallet_expense(
  p_expense_id UUID,
  p_debtor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id       UUID;
  v_payer_id        UUID;
  v_unsettled_count INTEGER := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id INTO v_payer_id
  FROM public.wallet_expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Verify caller is creditor (payer_id) or plan host
  IF v_caller_id != v_payer_id AND NOT public.is_plan_host((SELECT plan_id FROM public.wallet_expenses WHERE id = p_expense_id), v_caller_id) THEN
    RAISE EXCEPTION 'Only the creditor can undo settlement for this expense' USING ERRCODE = '40300';
  END IF;

  -- Update target participant obligation status back to PENDING
  UPDATE public.wallet_expense_participants
  SET status = 'PENDING',
      updated_at = now()
  WHERE expense_id = p_expense_id
    AND user_id = p_debtor_id
    AND status = 'SETTLED';

  GET DIAGNOSTICS v_unsettled_count = ROW_COUNT;

  -- Mark parent expense as PENDING since at least one participant is now unsettled
  UPDATE public.wallet_expenses
  SET status = 'PENDING',
      updated_at = now()
  WHERE id = p_expense_id;

  RETURN jsonb_build_object(
    'success', true,
    'unsettled_count', v_unsettled_count,
    'expense_id', p_expense_id,
    'debtor_id', p_debtor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsettle_wallet_expense(UUID, UUID) TO authenticated;
