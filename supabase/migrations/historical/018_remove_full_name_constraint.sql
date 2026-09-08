-- Migration: 018_remove_full_name_constraint
-- Description: Drop check constraints limiting users.full_name from being empty, set default value

-- Drop existing CHECK constraints on full_name column
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS check_full_name_not_empty;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_full_name_check;

-- Set default value for full_name to empty string
ALTER TABLE public.users ALTER COLUMN full_name SET DEFAULT '';

-- Comments for documentation and clarity
COMMENT ON COLUMN public.users.full_name IS 'User display name. Can be empty string initially during onboarding before profile completed.';
