-- Migration: 051_allow_reading_all_user_profiles
-- Description: Allow all authenticated users to view profiles of all other users.
--              This enables user discovery, searching, and plan invitation flows.

CREATE POLICY "Allow authenticated users to read all profiles"
ON public.users
FOR SELECT
TO authenticated
USING (true);
