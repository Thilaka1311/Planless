-- ============================================================================
-- Migration: Allow Additional Hosts (CO_HOST / HOST in plan_participants) to update plans
-- Description: Updates the RLS policy "Allow hosts to update plans" on public.plans table
--              so that both Creator Host and Additional Hosts can edit plan details.
-- ============================================================================

DROP POLICY IF EXISTS "Allow hosts to update plans" ON public.plans;

CREATE POLICY "Allow hosts to update plans" 
ON public.plans 
FOR UPDATE 
TO authenticated 
USING (
  auth.uid() = host_id 
  OR EXISTS (
    SELECT 1 
      FROM public.plan_participants pp 
     WHERE pp.plan_id = public.plans.id 
       AND pp.user_id = auth.uid() 
       AND pp.role IN ('HOST'::participant_role, 'CO_HOST'::participant_role)
       AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
)
WITH CHECK (
  auth.uid() = host_id 
  OR EXISTS (
    SELECT 1 
      FROM public.plan_participants pp 
     WHERE pp.plan_id = public.plans.id 
       AND pp.user_id = auth.uid() 
       AND pp.role IN ('HOST'::participant_role, 'CO_HOST'::participant_role)
       AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
);
