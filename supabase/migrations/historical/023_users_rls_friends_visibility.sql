-- Migration: 023_users_rls_friends_visibility
-- Description: Allow users to read profiles of their accepted friends.
--
-- Previously, the users SELECT policy restricted reads to auth.uid() = id only.
-- This blocked the Create Plan "Who's Invited" flow from resolving friend profiles,
-- since fetch-all runs under the authenticated user's JWT and RLS filters out all
-- non-self rows from the users table.
--
-- The fix adds a second SELECT policy so that a user can also read the profile row
-- of anyone who shares an ACCEPTED friendship record with them.

-- Drop old single-scope policy
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;

-- Policy 1: Users can always read their own profile
CREATE POLICY "Users can view their own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy 2: Users can read profiles of accepted friends
CREATE POLICY "Users can view accepted friends profiles"
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'ACCEPTED'
      AND (
        (f.user_1_id = auth.uid() AND f.user_2_id = public.users.id)
        OR
        (f.user_2_id = auth.uid() AND f.user_1_id = public.users.id)
      )
  )
);

COMMENT ON POLICY "Users can view accepted friends profiles" ON public.users
  IS 'Allows a user to read the profile of any user with whom they share an ACCEPTED friendship record.';
