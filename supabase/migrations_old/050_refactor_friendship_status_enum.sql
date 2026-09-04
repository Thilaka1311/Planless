-- Migration: 050_refactor_friendship_status_enum
-- Description: Refactor friendships table and enum type to reflect MVP business logic (only PENDING and ACCEPTED states exist).
--              Rejecting a friend request or removing a friend deletes the row.

-- 1. Data Migration / Cleanup: Delete any rows that are in 'REJECTED' status
DELETE FROM public.friendships WHERE status = 'REJECTED';

-- 2. Drop dependent policies temporarily
DROP POLICY IF EXISTS "Users can view accepted friends profiles" ON public.users;

-- 3. Alter status column type: 
-- Rename the old enum type
ALTER TYPE public.friendship_status RENAME TO friendship_status_old;

-- Create the new enum type with only PENDING and ACCEPTED
CREATE TYPE public.friendship_status AS ENUM (
  'PENDING',
  'ACCEPTED'
);

-- Drop default value constraint temporarily to allow type change
ALTER TABLE public.friendships ALTER COLUMN status DROP DEFAULT;

-- Alter column to use the new enum type, casting through text
ALTER TABLE public.friendships 
  ALTER COLUMN status TYPE public.friendship_status 
  USING status::text::public.friendship_status;

-- Re-apply default value
ALTER TABLE public.friendships ALTER COLUMN status SET DEFAULT 'PENDING'::public.friendship_status;

-- Drop the old enum type
DROP TYPE public.friendship_status_old;

-- 4. Re-create dependent policies
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

-- 5. Comments updates
COMMENT ON COLUMN public.friendships.status IS 'Friend request status (PENDING, ACCEPTED).';
