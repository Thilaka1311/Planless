-- Migration: Delete Wallet Expense RPC
-- Description: Adds a trusted SECURITY DEFINER RPC to safely delete an additional wallet expense and clean up participant rows atomically.

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
  v_host_id       UUID;
  v_title         TEXT;
  v_is_authorized BOOLEAN := FALSE;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch expense details
  SELECT plan_id, message_id, payer_id, title
    INTO v_plan_id, v_message_id, v_payer_id, v_title
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Protect default Plan Fee expenses (message_id IS NULL AND title = 'Plan Fee')
  IF v_message_id IS NULL AND v_title = 'Plan Fee' THEN
    RAISE EXCEPTION 'Cannot delete default plan fee expense' USING ERRCODE = '40300';
  END IF;

  -- 4. Check authorization: Caller must be the expense payer OR the plan host
  IF v_caller_id = v_payer_id THEN
    v_is_authorized := TRUE;
  ELSE
    IF v_plan_id IS NOT NULL THEN
      SELECT host_id INTO v_host_id FROM public.plans WHERE id = v_plan_id;
      IF FOUND AND v_host_id = v_caller_id THEN
        v_is_authorized := TRUE;
      END IF;
    END IF;
  END IF;

  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Not authorized to delete this expense' USING ERRCODE = '40300';
  END IF;

  -- 5. Delete participant rows and expense under system privilege
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

  -- 6. Return success JSON
  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'plan_id', v_plan_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_wallet_expense(UUID) TO authenticated;
