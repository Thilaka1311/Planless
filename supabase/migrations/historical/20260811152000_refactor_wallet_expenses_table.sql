-- Migration: Refactor wallet_expenses table from person-to-person balance to actual expense entity

-- Step 1: Add new columns message_id, title, total_amount, payer_id
ALTER TABLE public.wallet_expenses
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.plan_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS payer_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- Step 2: Safely migrate data from existing columns
UPDATE public.wallet_expenses
SET payer_id = receiver_id
WHERE payer_id IS NULL AND receiver_id IS NOT NULL;

UPDATE public.wallet_expenses
SET payer_id = sender_id
WHERE payer_id IS NULL AND sender_id IS NOT NULL;

UPDATE public.wallet_expenses we
SET title = COALESCE(p.title, 'Plan Expense')
FROM public.plans p
WHERE we.plan_id = p.id AND (we.title IS NULL OR we.title = '');

UPDATE public.wallet_expenses we
SET total_amount = COALESCE(p.total_cost, we.cost_per_participant, 0.00)
FROM public.plans p
WHERE we.plan_id = p.id AND we.total_amount IS NULL;

UPDATE public.wallet_expenses
SET total_amount = COALESCE(cost_per_participant, 0.00)
WHERE total_amount IS NULL;

UPDATE public.wallet_expenses SET title = 'Expense' WHERE title IS NULL;
UPDATE public.wallet_expenses SET total_amount = 0.00 WHERE total_amount IS NULL;

-- Step 3: Remove obsolete constraints
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS check_sender_not_receiver;
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS fk_wallet_expenses_plan_participant;
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS unique_plan_sender;
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS wallet_expenses_receiver_id_fkey;
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS wallet_expenses_sender_id_fkey;

-- Step 4: Drop obsolete columns
ALTER TABLE public.wallet_expenses DROP COLUMN IF EXISTS sender_id;
ALTER TABLE public.wallet_expenses DROP COLUMN IF EXISTS receiver_id;
ALTER TABLE public.wallet_expenses DROP COLUMN IF EXISTS cost_per_participant;
ALTER TABLE public.wallet_expenses DROP COLUMN IF EXISTS rsvp_status;

-- Step 5: Set NOT NULL on required new columns
ALTER TABLE public.wallet_expenses
  ALTER COLUMN payer_id SET NOT NULL,
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN total_amount SET NOT NULL;
