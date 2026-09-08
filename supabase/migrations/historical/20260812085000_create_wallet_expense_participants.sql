-- Migration: Create wallet_expense_participants table
-- This table stores how a specific wallet expense is split between participants.
-- Each row represents one participant's share within a single expense.

-- Step 1: Create participant payment status enum
CREATE TYPE public.participant_payment_status AS ENUM (
  'PENDING',
  'PARTIALLY_PAID',
  'PAID'
);

-- Step 2: Create the wallet_expense_participants table
CREATE TABLE public.wallet_expense_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    UUID NOT NULL REFERENCES public.wallet_expenses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_owed   NUMERIC(10,2) NOT NULL,
  amount_paid   NUMERIC(10,2) NOT NULL DEFAULT 0,
  status        public.participant_payment_status NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A participant should only appear once per expense
  CONSTRAINT wallet_expense_participants_unique_user UNIQUE (expense_id, user_id)
);

-- Step 3: Indexes for fast lookups
CREATE INDEX idx_wallet_expense_participants_expense_id
  ON public.wallet_expense_participants (expense_id);

CREATE INDEX idx_wallet_expense_participants_user_id
  ON public.wallet_expense_participants (user_id);

-- Step 4: Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_wallet_expense_participants_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_expense_participants_updated_at
  BEFORE UPDATE ON public.wallet_expense_participants
  FOR EACH ROW EXECUTE FUNCTION public.set_wallet_expense_participants_updated_at();
