-- Migration: 028_circles_rls_policies
-- Description: Define RLS policies for circles and circle_members.

-- =========================================================================
-- 1. CIRCLES POLICIES
-- =========================================================================
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view circles" ON public.circles;
DROP POLICY IF EXISTS "Allow authenticated users to insert circles" ON public.circles;
DROP POLICY IF EXISTS "Allow creators/hosts to update circles" ON public.circles;
DROP POLICY IF EXISTS "Allow creators/hosts to delete circles" ON public.circles;

-- Select: Allow any authenticated user to view circles.
CREATE POLICY "Allow authenticated users to view circles" 
ON public.circles 
FOR SELECT 
TO authenticated 
USING (true);

-- Insert: Allow authenticated users to create circles as long as they are the creator.
CREATE POLICY "Allow authenticated users to insert circles" 
ON public.circles 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = created_by);

-- Update: Allow creators to update circles.
CREATE POLICY "Allow creators/hosts to update circles" 
ON public.circles 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Delete: Allow creators to delete circles.
CREATE POLICY "Allow creators/hosts to delete circles" 
ON public.circles 
FOR DELETE 
TO authenticated 
USING (auth.uid() = created_by);


-- =========================================================================
-- 2. CIRCLE MEMBERS POLICIES
-- =========================================================================
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow authenticated users to insert circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow hosts/co-hosts to update circle members" ON public.circle_members;
DROP POLICY IF EXISTS "Allow users or hosts to delete circle members" ON public.circle_members;

-- Select: Allow authenticated users to view circle members.
CREATE POLICY "Allow authenticated users to view circle members" 
ON public.circle_members 
FOR SELECT 
TO authenticated 
USING (true);

-- Insert: Allow users to join or be inserted by circle creators/hosts/co-hosts.
CREATE POLICY "Allow authenticated users to insert circle members" 
ON public.circle_members 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.circles 
    WHERE circles.id = circle_id AND circles.created_by = auth.uid()
  )
);

-- Update: Allow creator_admin/admin to update roles.
CREATE POLICY "Allow hosts/co-hosts to update circle members" 
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
    WHERE cm.circle_id = circle_members.circle_id AND cm.user_id = auth.uid() AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.circles 
    WHERE circles.id = circle_id AND circles.created_by = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.circle_members cm
    WHERE cm.circle_id = circle_members.circle_id AND cm.user_id = auth.uid() AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
);

-- Delete: Allow users to leave or creator_admin/admin to delete member records.
CREATE POLICY "Allow users or hosts to delete circle members" 
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
    WHERE cm.circle_id = circle_members.circle_id AND cm.user_id = auth.uid() AND (cm.role = 'creator_admin'::circle_role OR cm.role = 'admin'::circle_role)
  )
);
