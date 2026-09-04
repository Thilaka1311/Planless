-- Migration: 016_users_rls
-- Description: Implement Row Level Security (RLS) policies for the users table

-- 1. Enable RLS on the users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure idempotency
DROP POLICY IF EXISTS "Users can create their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;

-- 3. Create INSERT policy (authenticated users can create only their own profile)
CREATE POLICY "Users can create their own profile"
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- 4. Create SELECT policy (authenticated users can read only their own profile)
CREATE POLICY "Users can view their own profile"
ON public.users
FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- 5. Create UPDATE policy (authenticated users can update only their own profile)
CREATE POLICY "Users can update their own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 6. Comments explaining design decisions
COMMENT ON TABLE public.users IS 'Profile metadata table secured via Row Level Security (RLS).';
COMMENT ON POLICY "Users can create their own profile" ON public.users IS 'Restricts profile creations so that users can only insert records matching their authenticated user ID.';
COMMENT ON POLICY "Users can view their own profile" ON public.users IS 'Limits profile reading access so users can only view their own profile records.';
COMMENT ON POLICY "Users can update their own profile" ON public.users IS 'Ensures users can only update profile details belonging to their authenticated session.';
