-- Migration: 20260808113500_add_participant_swap_enum.sql
-- Description: Add exact enum value 'participant_swap' to public.plan_activity_type ENUM.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'participant_swap' 
      AND enumtypid = 'public.plan_activity_type'::regtype
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'participant_swap';
  END IF;
END $$;
