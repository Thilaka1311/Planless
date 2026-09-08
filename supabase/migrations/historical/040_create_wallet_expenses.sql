-- Drop the legacy table
DROP TABLE IF EXISTS public.wallet_transactions CASCADE;

-- Create wallet expense status enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_expense_status') THEN
    CREATE TYPE wallet_expense_status AS ENUM ('PENDING', 'SETTLED');
  END IF;
END$$;

-- Create the new relationship-based wallet_expenses table
CREATE TABLE public.wallet_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  status wallet_expense_status NOT NULL DEFAULT 'PENDING'::wallet_expense_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Unique constraint: no duplicate pending/settled record for the same sender within a plan
  CONSTRAINT unique_plan_sender UNIQUE (plan_id, sender_id),
  -- Debtor/Sender cannot be the Creditor/Receiver
  CONSTRAINT check_sender_not_receiver CHECK (sender_id <> receiver_id)
);

-- Comments for documentation
COMMENT ON TABLE public.wallet_expenses IS 'Maintains running split expense obligations derived automatically from Plan participants.';
COMMENT ON COLUMN public.wallet_expenses.sender_id IS 'The participant who owes money.';
COMMENT ON COLUMN public.wallet_expenses.receiver_id IS 'The user who is owed money (normally the Host).';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_expenses_plan_id ON public.wallet_expenses(plan_id);
CREATE INDEX IF NOT EXISTS idx_wallet_expenses_circle_id ON public.wallet_expenses(circle_id);
CREATE INDEX IF NOT EXISTS idx_wallet_expenses_sender_id ON public.wallet_expenses(sender_id);
CREATE INDEX IF NOT EXISTS idx_wallet_expenses_receiver_id ON public.wallet_expenses(receiver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_expenses_status ON public.wallet_expenses(status);

-- Enable RLS
ALTER TABLE public.wallet_expenses ENABLE ROW LEVEL SECURITY;

-- Select Policy: Access allowed if the user is the sender, receiver, or a member of the corresponding circle
CREATE POLICY select_wallet_expenses ON public.wallet_expenses
  FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid() OR
    receiver_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.circle_members
      WHERE circle_members.circle_id = wallet_expenses.circle_id AND circle_members.user_id = auth.uid()
    )
  );

-- Modify write policies
CREATE POLICY insert_wallet_expenses ON public.wallet_expenses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY update_wallet_expenses ON public.wallet_expenses
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY delete_wallet_expenses ON public.wallet_expenses
  FOR DELETE
  TO authenticated
  USING (true);

-- Enable Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_expenses;
