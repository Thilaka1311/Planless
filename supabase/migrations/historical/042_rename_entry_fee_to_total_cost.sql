-- Migration: 042_rename_entry_fee_to_total_cost
-- Description: Drop entry_fee column from plans table and add total_cost column.

-- 1. Alter Table plans: drop column entry_fee, add column total_cost
ALTER TABLE public.plans DROP COLUMN IF EXISTS entry_fee CASCADE;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- Comments
COMMENT ON COLUMN public.plans.total_cost IS 'The total budget/cost paid by the host to run the plan.';
