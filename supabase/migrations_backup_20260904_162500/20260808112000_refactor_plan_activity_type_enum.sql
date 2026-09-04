-- Migration: 20260808112000_refactor_plan_activity_type_enum.sql
-- Description: Remove participant_moved_to_going and participant_moved_to_waitlist from plan_activity_type ENUM.

-- 1. Create temporary new enum type without obsolete movement values
CREATE TYPE public.plan_activity_type_new AS ENUM (
  'plan_created',
  'participant_invited',
  'participant_joined',
  'participant_left',
  'participant_waitlisted',
  'participant_promoted',
  'participant_removed',
  'invitation_accepted',
  'invitation_declined',
  'capacity_changed',
  'title_changed',
  'description_changed',
  'date_changed',
  'time_changed',
  'location_changed',
  'host_transferred',
  'plan_cancelled',
  'plan_restored',
  'plan_completed',
  'host_promoted',
  'participants_swapped'
);

-- 2. Delete any historical rows in plan_activity with obsolete enum values to ensure clean casting
DELETE FROM public.plan_activity 
WHERE activity_type::text IN ('participant_moved_to_going', 'participant_moved_to_waitlist');

-- 3. Alter plan_activity table column to use new enum
ALTER TABLE public.plan_activity 
  ALTER COLUMN activity_type TYPE public.plan_activity_type_new 
  USING activity_type::text::public.plan_activity_type_new;

-- 4. Drop old enum type
DROP TYPE public.plan_activity_type;

-- 5. Rename new enum type to plan_activity_type
ALTER TYPE public.plan_activity_type_new RENAME TO plan_activity_type;
