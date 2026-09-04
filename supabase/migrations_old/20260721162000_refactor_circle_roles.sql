-- Migration: 044_refactor_circle_roles
-- Description: Replace host/co_host circle roles with creator_admin/admin.
--   host      → creator_admin  (the user who created the circle; immutable)
--   co_host   → admin          (can manage members; cannot modify creator_admin)
--   member    → member         (unchanged)
--
-- This migration ONLY touches the circle_role enum and its dependents.
-- The participant_role enum (HOST / CO_HOST / PARTICIPANT) is separate and untouched.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rename enum values in-place (Postgres 10+)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER TYPE circle_role RENAME VALUE 'host'    TO 'creator_admin';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE circle_role RENAME VALUE 'co_host' TO 'admin';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- 'member' stays as-is.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sanity check: every circle must have exactly one creator_admin.
--    (The RENAME VALUE above already back-fills all rows in circle_members.)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM public.circles c
  WHERE (
    SELECT COUNT(*) FROM public.circle_members cm
    WHERE cm.circle_id = c.id AND cm.role = 'creator_admin'::circle_role
  ) <> 1;

  IF bad_count > 0 THEN
    RAISE WARNING '[044] % circle(s) do not have exactly one creator_admin after migration. Manual review required.', bad_count;
  ELSE
    RAISE NOTICE '[044] Sanity check passed: all circles have exactly one creator_admin.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace the transfer_circle_ownership RPC to use new role values
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION transfer_circle_ownership(
    p_circle_id UUID,
    p_old_host_id UUID,
    p_new_host_id UUID
) RETURNS VOID AS $$
BEGIN
    -- 1. Demote old creator_admin to admin
    UPDATE public.circle_members
    SET role = 'admin'::circle_role
    WHERE circle_id = p_circle_id AND user_id = p_old_host_id;

    -- 2. Promote new user to creator_admin
    UPDATE public.circle_members
    SET role = 'creator_admin'::circle_role
    WHERE circle_id = p_circle_id AND user_id = p_new_host_id;

    -- 3. Update circles table creator reference
    UPDATE public.circles
    SET created_by = p_new_host_id
    WHERE id = p_circle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update RLS policies for circle_members to use new role values
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old policies
DROP POLICY IF EXISTS "Allow hosts/co-hosts to update circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow users or hosts to delete circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow admins to update circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow admins to delete circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow users or admins to delete circle members" ON public.circle_members;

-- Update: Allow creator_admin or admin to update roles.
CREATE POLICY "Allow admins to update circle members"
ON public.circle_members
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.circles
    WHERE circles.id = circle_id AND circles.created_by = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = circle_members.circle_id
      AND cm.user_id = auth.uid()
      AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.circles
    WHERE circles.id = circle_id AND circles.created_by = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = circle_members.circle_id
      AND cm.user_id = auth.uid()
      AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
);

-- Delete: Allow self-removal or admin/creator_admin removal.
CREATE POLICY "Allow users or admins to delete circle members"
ON public.circle_members
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM public.circles
    WHERE circles.id = circle_id AND circles.created_by = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = circle_members.circle_id
      AND cm.user_id = auth.uid()
      AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update comment on circle_members.role column
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON COLUMN public.circle_members.role IS
  'Role of the user within the circle: creator_admin (original creator, immutable), admin (can manage members), member (default).';

-- 6. Ensure composite primary key on circle_members (circle_id, user_id)
ALTER TABLE public.circle_members DROP CONSTRAINT IF EXISTS circle_members_pkey;
ALTER TABLE public.circle_members DROP CONSTRAINT IF EXISTS unique_circle_member;
ALTER TABLE public.circle_members DROP COLUMN IF EXISTS id;
DO $$
BEGIN
  ALTER TABLE public.circle_members ADD PRIMARY KEY (circle_id, user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

