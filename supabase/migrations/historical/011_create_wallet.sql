-- Migration: 011_create_wallet
-- Description: Create the wallet_transactions table for Planless V2

CREATE TABLE wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  debtor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creditor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status wallet_status NOT NULL DEFAULT 'PENDING'::wallet_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT check_amount_non_negative CHECK (amount >= 0),
  CONSTRAINT check_debtor_not_creditor CHECK (debtor_id <> creditor_id),
  CONSTRAINT unique_plan_debtor UNIQUE (plan_id, debtor_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE wallet_transactions IS 'Host-centric payment ledger tracking participant fees for plans.';
COMMENT ON COLUMN wallet_transactions.id IS 'Primary key.';
COMMENT ON COLUMN wallet_transactions.plan_id IS 'The plan associated with this transaction.';
COMMENT ON COLUMN wallet_transactions.debtor_id IS 'The participant who owes the fee.';
COMMENT ON COLUMN wallet_transactions.creditor_id IS 'The host who is owed the fee.';
COMMENT ON COLUMN wallet_transactions.amount IS 'The participation fee amount.';
COMMENT ON COLUMN wallet_transactions.status IS 'Payment status (PENDING, PAID).';
COMMENT ON COLUMN wallet_transactions.created_at IS 'Timestamp when the transaction entry was created.';
COMMENT ON COLUMN wallet_transactions.paid_at IS 'Timestamp when the payment was settled.';

-- Application Workflow:
-- 1. When a participant joins a paid plan:
--    The application inserts one row: debtor_id = participant, creditor_id = host, amount = plans.entry_fee, status = 'PENDING'
-- 2. When the participant pays the host:
--    Update: status = 'PAID', paid_at = now()
-- Note: A participant can only owe the host once per plan (unique_plan_debtor). They never owe each other.
