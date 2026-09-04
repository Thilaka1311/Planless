-- Migration: 039_circle_messages_rls_policies
-- Description: Implement Row Level Security (RLS) policies for the circle_messages table.

-- 1. Enable Row Level Security
ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Allow active members to select messages" ON public.circle_messages;
DROP POLICY IF EXISTS "Allow active members to insert messages" ON public.circle_messages;
DROP POLICY IF EXISTS "Deny all updates on messages" ON public.circle_messages;
DROP POLICY IF EXISTS "Deny all deletes on messages" ON public.circle_messages;

-- 3. Create SELECT Policy
-- Users can only read messages if they are currently an active member of the corresponding Circle.
CREATE POLICY "Allow active members to select messages"
ON public.circle_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_members.circle_id = circle_messages.circle_id
      AND circle_members.user_id = auth.uid()
  )
);

-- 4. Create INSERT Policy
-- Users can only insert messages if they are an active member of the Circle and profile_user_id (sender_id) matches their authenticated ID.
CREATE POLICY "Allow active members to insert messages"
ON public.circle_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.circle_members
    WHERE circle_members.circle_id = circle_messages.circle_id
      AND circle_members.user_id = auth.uid()
  )
);

-- 5. Create UPDATE Policy
-- Explicitly deny updates by not allowing any rows to match (evaluated to false).
CREATE POLICY "Deny all updates on messages"
ON public.circle_messages
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- 6. Create DELETE Policy
-- Explicitly deny deletes by not allowing any rows to match (evaluated to false).
CREATE POLICY "Deny all deletes on messages"
ON public.circle_messages
FOR DELETE
TO authenticated
USING (false);
