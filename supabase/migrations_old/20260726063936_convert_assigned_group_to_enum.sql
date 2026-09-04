-- Migration: Convert assigned_group column to assigned_group_enum
-- Description: Creates assigned_group_enum ('GOING', 'WAITLIST') and converts plan_participants.assigned_group to it.

ALTER TABLE public.plan_participants ALTER COLUMN assigned_group DROP DEFAULT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assigned_group_enum') THEN
    CREATE TYPE public.assigned_group_enum AS ENUM ('GOING', 'WAITLIST');
  END IF;
END $$;

-- Update any Automatic plan participant rows to NULL
UPDATE public.plan_participants pp
SET assigned_group = NULL
FROM public.plans p
WHERE pp.plan_id = p.id
  AND p.participant_filtering = 'AUTOMATIC';

-- Alter column to use assigned_group_enum
ALTER TABLE public.plan_participants
  ALTER COLUMN assigned_group TYPE public.assigned_group_enum
  USING (
    CASE 
      WHEN assigned_group = 'WAITLIST' THEN 'WAITLIST'::public.assigned_group_enum
      WHEN assigned_group = 'GOING' THEN 'GOING'::public.assigned_group_enum
      ELSE NULL
    END
  );

ALTER TABLE public.plan_participants ALTER COLUMN assigned_group SET DEFAULT NULL;
