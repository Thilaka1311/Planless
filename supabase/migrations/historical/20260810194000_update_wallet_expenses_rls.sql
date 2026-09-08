-- Fix Row-Level Security (RLS) policies on wallet_expenses, users, and plans
-- to allow SELECT access for client queries when authenticated via public/anon role or active session.

DROP POLICY IF EXISTS select_wallet_expenses ON public.wallet_expenses;
CREATE POLICY select_wallet_expenses ON public.wallet_expenses
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS select_users ON public.users;
CREATE POLICY select_users ON public.users
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS select_plans ON public.plans;
CREATE POLICY select_plans ON public.plans
  FOR SELECT
  TO public
  USING (true);
