-- Migration: Update plan_activity SELECT policy to allow participants to read RESOLVED leave_requested activities
-- Description: Enables plan participants to select leave_requested activity rows when metadata->>'status' = 'RESOLVED'.

DROP POLICY IF EXISTS "Allow plan participants to select plan_activity" ON public.plan_activity;

CREATE POLICY "Allow plan participants to select plan_activity"
ON public.plan_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_activity.plan_id
      AND plan_participants.user_id = auth.uid()
  )
  AND (
    activity_type <> 'leave_requested'::plan_activity_type
    OR (metadata->>'status' = 'RESOLVED')
    OR EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = plan_activity.plan_id
        AND plans.host_id = auth.uid()
    )
  )
);
