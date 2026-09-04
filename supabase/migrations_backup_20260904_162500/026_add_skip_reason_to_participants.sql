-- Migration: 026_add_skip_reason_to_participants
-- Description: Create skip_reason enum and add skip_reason column to public.plan_participants.

-- 1. Clean up existing if needed (for clean local/remote sync)
ALTER TABLE public.plan_participants DROP COLUMN IF EXISTS skip_reason;
DROP TYPE IF EXISTS public.skip_reason;

-- 2. Create the enum type
CREATE TYPE public.skip_reason AS ENUM ('LEFT', 'REMOVED');

-- 3. Add the column to plan_participants using the custom enum type
ALTER TABLE public.plan_participants ADD COLUMN skip_reason public.skip_reason;
