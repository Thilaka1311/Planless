-- Drop legacy constraint if any
ALTER TABLE public.wallet_expenses DROP CONSTRAINT IF EXISTS fk_wallet_expenses_plan_participant;

-- Remove standalone amount column
ALTER TABLE public.wallet_expenses DROP COLUMN IF EXISTS amount;

-- Add cost_per_participant column to wallet_expenses
ALTER TABLE public.wallet_expenses ADD COLUMN IF NOT EXISTS cost_per_participant NUMERIC(10,2);

-- Add rsvp_status column to wallet_expenses
ALTER TABLE public.wallet_expenses ADD COLUMN IF NOT EXISTS rsvp_status public.rsvp_status;

-- Add foreign key constraint linking to plan_participants composite primary key
ALTER TABLE public.wallet_expenses 
ADD CONSTRAINT fk_wallet_expenses_plan_participant 
FOREIGN KEY (plan_id, sender_id) 
REFERENCES public.plan_participants(plan_id, user_id) 
ON DELETE CASCADE;
