-- Migration: Create RLS policies for public.wallet_expense_participants
-- Enables Row Level Security and defines SELECT, INSERT, UPDATE, and DELETE policies.

ALTER TABLE public.wallet_expense_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_expense_participants_select ON public.wallet_expense_participants;
DROP POLICY IF EXISTS wallet_expense_participants_insert ON public.wallet_expense_participants;
DROP POLICY IF EXISTS wallet_expense_participants_update ON public.wallet_expense_participants;
DROP POLICY IF EXISTS wallet_expense_participants_delete ON public.wallet_expense_participants;

-- SELECT: Participant, payer of the expense, or plan host can view participant rows
CREATE POLICY wallet_expense_participants_select ON public.wallet_expense_participants
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND wallet_expenses.payer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      JOIN public.plans ON plans.id = wallet_expenses.plan_id
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND plans.host_id = auth.uid()
    )
  );

-- INSERT: Payer of the expense or plan host can insert participant rows
CREATE POLICY wallet_expense_participants_insert ON public.wallet_expense_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wallet_expenses
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND wallet_expenses.payer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      JOIN public.plans ON plans.id = wallet_expenses.plan_id
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND plans.host_id = auth.uid()
    )
  );

-- UPDATE: Participant, payer of the expense, or plan host can update participant rows
CREATE POLICY wallet_expense_participants_update ON public.wallet_expense_participants
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND wallet_expenses.payer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      JOIN public.plans ON plans.id = wallet_expenses.plan_id
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND plans.host_id = auth.uid()
    )
  );

-- DELETE: Payer of the expense or plan host can delete participant rows
CREATE POLICY wallet_expense_participants_delete ON public.wallet_expense_participants
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_expenses
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND wallet_expenses.payer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      JOIN public.plans ON plans.id = wallet_expenses.plan_id
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND plans.host_id = auth.uid()
    )
  );
