-- Migration: 20260801095500_add_host_participant_management_activities.sql
-- Description: Add participant_moved_to_waitlist and participant_moved_to_going to plan_activity_type ENUM.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.plan_activity_type'::regtype 
      AND enumlabel = 'participant_moved_to_waitlist'
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'participant_moved_to_waitlist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.plan_activity_type'::regtype 
      AND enumlabel = 'participant_moved_to_going'
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'participant_moved_to_going';
  END IF;
END $$;
