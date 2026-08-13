-- Migration: Refactor participant_payment_status enum to PENDING / SETTLED

-- Step 1: Alter column status temporarily to text
ALTER TABLE public.wallet_expense_participants
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE text USING status::text;

-- Step 2: Update text values safely
UPDATE public.wallet_expense_participants
SET status = 'SETTLED'
WHERE status IN ('PAID', 'SETTLED');

UPDATE public.wallet_expense_participants
SET status = 'PENDING'
WHERE status != 'SETTLED';

-- Step 3: Drop old enum type and recreate with PENDING, SETTLED
DROP TYPE IF EXISTS public.participant_payment_status;

CREATE TYPE public.participant_payment_status AS ENUM (
  'PENDING',
  'SETTLED'
);

-- Step 4: Convert status column back to participant_payment_status with DEFAULT 'PENDING'
ALTER TABLE public.wallet_expense_participants
  ALTER COLUMN status TYPE public.participant_payment_status USING status::public.participant_payment_status,
  ALTER COLUMN status SET DEFAULT 'PENDING';
