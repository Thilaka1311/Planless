-- Migration: 022_plans_rls_policies
-- Description: Enable and define RLS policies for plans, plan_participants, plan_invites, and friendships.

-- =========================================================================
-- 1. PLANS POLICIES
-- =========================================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view plans" ON public.plans;
DROP POLICY IF EXISTS "Allow authenticated users to insert plans" ON public.plans;
DROP POLICY IF EXISTS "Allow hosts to update plans" ON public.plans;
DROP POLICY IF EXISTS "Allow hosts to delete plans" ON public.plans;

-- Select: Allow any authenticated user to view plans so they can browse, join, or accept invites.
CREATE POLICY "Allow authenticated users to view plans" 
ON public.plans 
FOR SELECT 
TO authenticated 
USING (true);

-- Insert: Allow authenticated users to create plans as long as they are designated as the host.
CREATE POLICY "Allow authenticated users to insert plans" 
ON public.plans 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = host_id);

-- Update: Allow hosts to update their own plans.
CREATE POLICY "Allow hosts to update plans" 
ON public.plans 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = host_id)
WITH CHECK (auth.uid() = host_id);

-- Delete: Allow hosts to delete their own plans.
CREATE POLICY "Allow hosts to delete plans" 
ON public.plans 
FOR DELETE 
TO authenticated 
USING (auth.uid() = host_id);


-- =========================================================================
-- 2. PLAN PARTICIPANTS POLICIES
-- =========================================================================
ALTER TABLE public.plan_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view plan participants" ON public.plan_participants;
DROP POLICY IF EXISTS "Allow authenticated users to insert plan participants" ON public.plan_participants;
DROP POLICY IF EXISTS "Allow users to update participant status" ON public.plan_participants;
DROP POLICY IF EXISTS "Allow users to delete participant status" ON public.plan_participants;

-- Select: Allow authenticated users to view participants of plans.
CREATE POLICY "Allow authenticated users to view plan participants" 
ON public.plan_participants 
FOR SELECT 
TO authenticated 
USING (true);

-- Insert: Allow users to join plans (insert themselves) or allow the host of the plan to invite them.
CREATE POLICY "Allow authenticated users to insert plan participants" 
ON public.plan_participants 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
);

-- Update: Allow users to update their own RSVP/status or allow the host to manage statuses.
CREATE POLICY "Allow users to update participant status" 
ON public.plan_participants 
FOR UPDATE 
TO authenticated 
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
);

-- Delete: Allow users to leave a plan (delete their row) or allow the host to remove/kick them.
CREATE POLICY "Allow users to delete participant status" 
ON public.plan_participants 
FOR DELETE 
TO authenticated 
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
);


-- =========================================================================
-- 3. PLAN INVITES POLICIES
-- =========================================================================
ALTER TABLE public.plan_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view plan invites" ON public.plan_invites;
DROP POLICY IF EXISTS "Allow hosts to insert plan invites" ON public.plan_invites;
DROP POLICY IF EXISTS "Allow hosts to update plan invites" ON public.plan_invites;

-- Select: Allow authenticated users to retrieve invite links to verify and join.
CREATE POLICY "Allow authenticated users to view plan invites" 
ON public.plan_invites 
FOR SELECT 
TO authenticated 
USING (true);

-- Insert: Allow users to generate invite tokens for plans they host.
CREATE POLICY "Allow hosts to insert plan invites" 
ON public.plan_invites 
FOR INSERT 
TO authenticated 
WITH CHECK (
  auth.uid() = created_by AND
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
);

-- Update: Allow hosts to activate/deactivate/update invite links for plans they host.
CREATE POLICY "Allow hosts to update plan invites" 
ON public.plan_invites 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  )
);


-- =========================================================================
-- 4. FRIENDSHIPS POLICIES
-- =========================================================================
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to view friendships" ON public.friendships;
DROP POLICY IF EXISTS "Allow authenticated users to insert friendships" ON public.friendships;
DROP POLICY IF EXISTS "Allow authenticated users to update friendships" ON public.friendships;

-- Select: Allow users to view their own friendship status.
CREATE POLICY "Allow authenticated users to view friendships" 
ON public.friendships 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Insert: Allow users to request/insert friendships where they are one of the two parties.
CREATE POLICY "Allow authenticated users to insert friendships" 
ON public.friendships 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_1_id OR auth.uid() = user_2_id);

-- Update: Allow users to accept/reject/update friendships they are one of the parties of.
CREATE POLICY "Allow authenticated users to update friendships" 
ON public.friendships 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = user_1_id OR auth.uid() = user_2_id)
WITH CHECK (auth.uid() = user_1_id OR auth.uid() = user_2_id);
