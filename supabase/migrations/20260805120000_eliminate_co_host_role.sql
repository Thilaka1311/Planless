-- Migration: Completely drop CO_HOST from participant_role PostgreSQL enum
-- Description:
-- 1. Migrate any existing 'CO_HOST' records in plan_participants to 'HOST'.
-- 2. Safely recreate participant_role enum containing only ('HOST', 'PARTICIPANT').

BEGIN;

-- Step 1: Migrate existing data to text representation temporarily if needed
UPDATE public.plan_participants
SET role = 'HOST'::participant_role
WHERE role::text = 'CO_HOST';

-- Step 2: Create temporary enum with only ('HOST', 'PARTICIPANT')
CREATE TYPE participant_role_new AS ENUM ('HOST', 'PARTICIPANT');

-- Step 3: Alter plan_participants table to use new enum type
ALTER TABLE public.plan_participants
  ALTER COLUMN role TYPE participant_role_new
  USING (
    CASE 
      WHEN role::text = 'CO_HOST' THEN 'HOST'::participant_role_new
      ELSE role::text::participant_role_new
    END
  );

-- Step 4: Drop old enum type and rename new enum type to participant_role
DROP TYPE public.participant_role;
ALTER TYPE public.participant_role_new RENAME TO participant_role;

COMMIT;
