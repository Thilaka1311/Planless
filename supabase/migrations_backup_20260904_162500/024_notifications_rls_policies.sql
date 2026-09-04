-- Migration: 024_notifications_rls_policies
-- Description: Implement Row Level Security policies for the notifications table.
--
-- Context:
--   RLS was already enabled on notifications (relrowsecurity = true) but no
--   policies existed, resulting in a deny-all state. This caused:
--     "New row violates row-level security policy for table 'notifications'"
--   whenever plan creation attempted to insert invitation notifications for invitees.
--
-- Operations performed against notifications:
--   SELECT  — fetch-all reads all notifications scoped to the current user
--   INSERT  — plan/circle actions write notifications for OTHER users (recipients)
--             The acting user (host) is authenticated but user_id in the row
--             belongs to the recipient, so we allow any authenticated user to insert.
--   UPDATE  — marking is_read = true; users may only update their own rows
--
-- Security model mirrors the pattern used for plan_participants and friendships:
--   reads and self-updates are tightly scoped; inserts are open to authenticated
--   users because the backend enforces authorization at the application layer.

-- 1. Drop any pre-existing policies to make this migration idempotent
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view their own notifications"        ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications"      ON public.notifications;

-- 2. SELECT — users can only read notifications addressed to them
CREATE POLICY "Users can view their own notifications"
ON public.notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3. INSERT — any authenticated user can create a notification for any recipient
--    Rationale: a plan host inserts notifications where user_id = invitee UUID,
--    which differs from auth.uid(). Application-layer logic controls who triggers
--    notification creation; RLS here only requires the actor to be authenticated.
CREATE POLICY "Authenticated users can insert notifications"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 4. UPDATE — users can only mark their own notifications as read
CREATE POLICY "Users can update their own notifications"
ON public.notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 5. Comments
COMMENT ON POLICY "Users can view their own notifications"   ON public.notifications
  IS 'Users can only SELECT notification rows addressed to their own user_id.';
COMMENT ON POLICY "Authenticated users can insert notifications" ON public.notifications
  IS 'Any authenticated user can INSERT notifications for any recipient. The host inserts notifications for invitees whose user_id differs from auth.uid().';
COMMENT ON POLICY "Users can update their own notifications" ON public.notifications
  IS 'Users can only UPDATE (e.g. mark is_read = true) on notifications addressed to their own user_id.';
