-- ============================================================
-- Migration: Create plan-images Supabase Storage Bucket & Policies
--
-- Architecture:
-- 1. Bucket 'plan-images' stores canonical plan cover images named <plan_id>.webp
-- 2. Public read access so participants/users can view plan images
-- 3. Insert/Update/Delete restricted to authenticated active hosts
--    (role = 'HOST' AND rsvp_status = 'JOINED' in plan_participants)
-- ============================================================

-- 1. Insert bucket 'plan-images' into storage.buckets if not already present
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'plan-images',
  'plan-images',
  true,
  10485760, -- 10MB limit
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Security helper function to check active host authorization for a storage object
CREATE OR REPLACE FUNCTION public.is_plan_image_host(object_name text, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_id text;
  v_plan_id uuid;
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Extract plan UUID from object name (e.g., "<plan_id>.webp" or "plan-images/<plan_id>.webp")
  v_raw_id := split_part(storage.filename(object_name), '.', 1);
  IF v_raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  v_plan_id := v_raw_id::uuid;

  -- Verify caller is an active host of this plan
  RETURN EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = v_plan_id
       AND plan_participants.user_id = is_plan_image_host.user_id
       AND plan_participants.role = 'HOST'::participant_role
       AND plan_participants.rsvp_status = 'JOINED'::rsvp_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_plan_image_host(TEXT, UUID) TO authenticated;

-- 3. Storage Policies for plan-images

-- Public / Authenticated read
DROP POLICY IF EXISTS "Public read plan images" ON storage.objects;
CREATE POLICY "Public read plan images"
ON storage.objects FOR SELECT
USING (bucket_id = 'plan-images');

-- Authenticated upload for plan active hosts
DROP POLICY IF EXISTS "Active hosts can upload plan images" ON storage.objects;
CREATE POLICY "Active hosts can upload plan images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'plan-images'
  AND public.is_plan_image_host(name, auth.uid())
);

-- Authenticated update for plan active hosts
DROP POLICY IF EXISTS "Active hosts can update plan images" ON storage.objects;
CREATE POLICY "Active hosts can update plan images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'plan-images'
  AND public.is_plan_image_host(name, auth.uid())
)
WITH CHECK (
  bucket_id = 'plan-images'
  AND public.is_plan_image_host(name, auth.uid())
);

-- Authenticated delete for plan active hosts
DROP POLICY IF EXISTS "Active hosts can delete plan images" ON storage.objects;
CREATE POLICY "Active hosts can delete plan images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'plan-images'
  AND public.is_plan_image_host(name, auth.uid())
);
