-- Migration: Enforce 50-character maximum limit on plans.title
-- Description: Adds a check constraint on public.plans table to limit title length to 50 characters

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS check_title_max_length;

ALTER TABLE public.plans
  ADD CONSTRAINT check_title_max_length CHECK (char_length(title) <= 50);
