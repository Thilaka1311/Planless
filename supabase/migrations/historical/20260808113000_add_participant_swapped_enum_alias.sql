-- Migration: 20260808113000_add_participant_swapped_enum_alias.sql
-- Description: Add participant_swapped to public.plan_activity_type ENUM to support both singular and plural enum values seamlessly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'participant_swapped' 
      AND enumtypid = 'public.plan_activity_type'::regtype
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'participant_swapped';
  END IF;
END $$;
