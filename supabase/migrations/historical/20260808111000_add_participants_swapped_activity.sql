-- Migration: 20260808111000_add_participants_swapped_activity.sql
-- Description: Add participants_swapped value to public.plan_activity_type ENUM safely.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'participants_swapped' 
      AND enumtypid = 'public.plan_activity_type'::regtype
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'participants_swapped';
  END IF;
END $$;
