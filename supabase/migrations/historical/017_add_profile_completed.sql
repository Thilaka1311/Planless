-- Migration: 017_add_profile_completed
-- Description: Add profile_completed flag to the users table to manage onboarding state

-- Add the profile_completed column with default value false
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Comments for documentation and clarity
COMMENT ON COLUMN public.users.profile_completed IS 'Flag indicating whether a user has successfully finished onboarding profile setup.';
