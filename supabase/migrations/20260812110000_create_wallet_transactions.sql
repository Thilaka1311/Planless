-- Migration: Create wallet_transactions table
-- Description: Stores actual payments/settlements between two users for a specific expense & plan.

-- Step 1: Create transaction_status enum
CREATE TYPE public.transaction_status AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

-- Step 2: Create sequence for public_id trigger
CREATE SEQUENCE IF NOT EXISTS public.wallet_transaction_public_id_seq START WITH 1;

-- Step 3: Create wallet_transactions table
CREATE TABLE public.wallet_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id   UUID NOT NULL REFERENCES public.wallet_expenses(id) ON DELETE CASCADE,
  plan_id      UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount       NUMERIC(10,2) NOT NULL,
  status       public.transaction_status NOT NULL DEFAULT 'COMPLETED',
  public_id    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Sender and receiver must be different
  CONSTRAINT chk_wallet_transactions_sender_receiver_different CHECK (sender_id != receiver_id),
  CONSTRAINT chk_wallet_transactions_amount_positive CHECK (amount > 0)
);

-- Step 4: Triggers for public_id and updated_at
CREATE OR REPLACE FUNCTION public.generate_wallet_transaction_public_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE next_val BIGINT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    next_val := nextval('public.wallet_transaction_public_id_seq');
    NEW.public_id := 'TXN' || lpad(next_val::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_transactions_public_id
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.generate_wallet_transaction_public_id();

CREATE OR REPLACE FUNCTION public.set_wallet_transactions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_transactions_updated_at
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_wallet_transactions_updated_at();

-- Step 5: Indexes for fast lookups
CREATE INDEX idx_wallet_transactions_expense_id ON public.wallet_transactions(expense_id);
CREATE INDEX idx_wallet_transactions_plan_id ON public.wallet_transactions(plan_id);
CREATE INDEX idx_wallet_transactions_sender_id ON public.wallet_transactions(sender_id);
CREATE INDEX idx_wallet_transactions_receiver_id ON public.wallet_transactions(receiver_id);
CREATE INDEX idx_wallet_transactions_status ON public.wallet_transactions(status);

-- Step 6: Enable RLS and define policies
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY wallet_transactions_select ON public.wallet_transactions
  FOR SELECT
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  );

CREATE POLICY wallet_transactions_insert ON public.wallet_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_plan_host(plan_id, auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.plan_participants
      WHERE plan_id = wallet_transactions.plan_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY wallet_transactions_update ON public.wallet_transactions
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    OR receiver_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  );

CREATE POLICY wallet_transactions_delete ON public.wallet_transactions
  FOR DELETE
  TO authenticated
  USING (
    receiver_id = auth.uid()
    OR public.is_plan_host(plan_id, auth.uid())
  );
