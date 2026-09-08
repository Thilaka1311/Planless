-- Migration: 043_make_cost_per_participant_nullable
-- Description: Make cost_per_participant column nullable in plan_participants table.

-- 1. Alter cost_per_participant: drop NOT NULL constraint
ALTER TABLE public.plan_participants ALTER COLUMN cost_per_participant DROP NOT NULL;

-- 2. Alter cost_per_participant: drop default constraint (so it defaults to NULL)
ALTER TABLE public.plan_participants ALTER COLUMN cost_per_participant DROP DEFAULT;
