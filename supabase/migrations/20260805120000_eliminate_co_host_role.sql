-- Migration: Completely drop CO_HOST from participant_role PostgreSQL enum
-- Description:
-- 1. Migrate any existing 'CO_HOST' records in plan_participants to 'HOST'.
-- 2. Safely recreate participant_role enum containing only ('HOST', 'PARTICIPANT').

BEGIN;

-- Step 1: Migrate existing data to text representation temporarily if needed
UPDATE public.plan_participants
SET role = 'HOST'::participant_role
WHERE role::text = 'CO_HOST';

-- Step 2: Create temporary enum with only ('HOST', 'PARTICIPANT')
CREATE TYPE participant_role_new AS ENUM ('HOST', 'PARTICIPANT');

-- Step 3: Drop dependent policies and alter plan_participants table to use new enum type
DROP POLICY IF EXISTS "Hosts and users can update plan participants" ON public.plan_participants;
DROP POLICY IF EXISTS "Hosts and users can delete plan participants" ON public.plan_participants;
DROP POLICY IF EXISTS "Allow hosts to update plans" ON public.plans;
DROP POLICY IF EXISTS "Hosts can update plans" ON public.plans;

ALTER TABLE public.plan_participants ALTER COLUMN role DROP DEFAULT;

ALTER TABLE public.plan_participants
  ALTER COLUMN role TYPE participant_role_new
  USING (
    CASE 
      WHEN role::text = 'CO_HOST' THEN 'HOST'::participant_role_new
      ELSE role::text::participant_role_new
    END
  );

ALTER TABLE public.plan_participants ALTER COLUMN role SET DEFAULT 'PARTICIPANT'::participant_role_new;

-- Step 4: Drop old enum type and rename new enum type to participant_role
DROP TYPE public.participant_role;
ALTER TYPE public.participant_role_new RENAME TO participant_role;

-- Step 5: Recreate updated policies
CREATE POLICY "Hosts and users can update plan participants" ON public.plan_participants
  FOR UPDATE USING (
    (auth.uid() = user_id) OR 
    (EXISTS (
      SELECT 1 FROM public.plan_participants pp 
      WHERE pp.plan_id = plan_participants.plan_id 
        AND pp.user_id = auth.uid() 
        AND pp.role = 'HOST'::participant_role
    ))
  );

CREATE POLICY "Hosts and users can delete plan participants" ON public.plan_participants
  FOR DELETE USING (
    (auth.uid() = user_id) OR 
    (EXISTS (
      SELECT 1 FROM public.plan_participants pp 
      WHERE pp.plan_id = plan_participants.plan_id 
        AND pp.user_id = auth.uid() 
        AND pp.role = 'HOST'::participant_role
    ))
  );

CREATE POLICY "Allow hosts to update plans" ON public.plans
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = host_id 
    OR EXISTS (
      SELECT 1 FROM public.plan_participants pp 
      WHERE pp.plan_id = public.plans.id 
        AND pp.user_id = auth.uid() 
        AND pp.role = 'HOST'::participant_role
        AND pp.rsvp_status = 'JOINED'::rsvp_status
    )
  )
  WITH CHECK (
    auth.uid() = host_id 
    OR EXISTS (
      SELECT 1 FROM public.plan_participants pp 
      WHERE pp.plan_id = public.plans.id 
        AND pp.user_id = auth.uid() 
        AND pp.role = 'HOST'::participant_role
        AND pp.rsvp_status = 'JOINED'::rsvp_status
    )
  );

COMMIT;
