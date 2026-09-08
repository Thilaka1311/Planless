-- Migration: 20260801100000_allow_authenticated_insert_plan_activity.sql
-- Description: Update RLS policies on public.plan_activity to allow authenticated plan participants/hosts to INSERT activity records.

-- Drop old restrictive INSERT policy
DROP POLICY IF EXISTS "Deny insert on plan_activity for authenticated users" ON public.plan_activity;
DROP POLICY IF EXISTS "Allow authenticated users to insert plan_activity" ON public.plan_activity;

-- Create new INSERT policy allowing authenticated plan participants to insert activity records for their plan
CREATE POLICY "Allow authenticated users to insert plan_activity"
ON public.plan_activity
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_activity.plan_id
      AND plan_participants.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.plans
    WHERE plans.id = plan_activity.plan_id
      AND plans.host_id = auth.uid()
  )
);
