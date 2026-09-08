-- Migration: Create RLS policies for public.wallet_expenses
-- Description: Enforces expense-level authorization for SELECT, INSERT, UPDATE, and DELETE operations.

-- Step 1: Create SECURITY DEFINER helper functions to prevent policy evaluation recursion
CREATE OR REPLACE FUNCTION public.is_wallet_expense_participant(p_expense_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_expense_participants
    WHERE expense_id = p_expense_id
      AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_plan_host(p_plan_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.plans
    WHERE id = p_plan_id
      AND host_id = p_user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_wallet_expense_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_plan_host(UUID, UUID) TO authenticated;

-- Step 2: Enable RLS on public.wallet_expenses
ALTER TABLE public.wallet_expenses ENABLE ROW LEVEL SECURITY;

-- Step 3: Drop existing policies
DROP POLICY IF EXISTS select_wallet_expenses ON public.wallet_expenses;
DROP POLICY IF EXISTS insert_wallet_expenses ON public.wallet_expenses;
DROP POLICY IF EXISTS update_wallet_expenses ON public.wallet_expenses;
DROP POLICY IF EXISTS delete_wallet_expenses ON public.wallet_expenses;
DROP POLICY IF EXISTS wallet_expenses_select ON public.wallet_expenses;
DROP POLICY IF EXISTS wallet_expenses_insert ON public.wallet_expenses;
DROP POLICY IF EXISTS wallet_expenses_update ON public.wallet_expenses;
DROP POLICY IF EXISTS wallet_expenses_delete ON public.wallet_expenses;

-- Step 4: Define RLS policies

-- SELECT: Payer, split participants (via helper), or plan host can read
CREATE POLICY wallet_expenses_select ON public.wallet_expenses
  FOR SELECT
  TO authenticated
  USING (
    payer_id = auth.uid()
    OR public.is_wallet_expense_participant(id, auth.uid())
    OR public.is_plan_host(plan_id, auth.uid())
  );

-- INSERT: Authenticated user must be the designated payer_id AND be a participant of the corresponding plan
CREATE POLICY wallet_expenses_insert ON public.wallet_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.plan_participants
      WHERE plan_participants.plan_id = wallet_expenses.plan_id
        AND plan_participants.user_id = auth.uid()
    )
  );

-- UPDATE: Only authorized expense creator (payer_id) or plan host can update
CREATE POLICY wallet_expenses_update ON public.wallet_expenses
  FOR UPDATE
  TO authenticated
  USING (
    payer_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  )
  WITH CHECK (
    payer_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  );

-- DELETE: Only authorized expense creator (payer_id) or plan host can delete
CREATE POLICY wallet_expenses_delete ON public.wallet_expenses
  FOR DELETE
  TO authenticated
  USING (
    payer_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  );
