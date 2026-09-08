-- Migration: 041_refactor_plan_participants
-- Description: Drop surrogate PK from plan_participants and set composite (plan_id, user_id) PK. Add cost_per_participant.

-- 1. Drop existing primary key constraint on plan_participants
ALTER TABLE public.plan_participants DROP CONSTRAINT IF EXISTS plan_participants_pkey CASCADE;

-- 2. Drop the surrogate key column id
ALTER TABLE public.plan_participants DROP COLUMN IF EXISTS id CASCADE;

-- 3. Define composite primary key
ALTER TABLE public.plan_participants ADD PRIMARY KEY (plan_id, user_id);

-- 4. Add cost_per_participant column
ALTER TABLE public.plan_participants ADD COLUMN IF NOT EXISTS cost_per_participant NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- Comments
COMMENT ON COLUMN public.plan_participants.cost_per_participant IS 'The calculated split cost share that this participant owes for the Plan.';
