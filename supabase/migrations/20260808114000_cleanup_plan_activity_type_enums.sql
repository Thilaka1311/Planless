-- Migration: 20260808114000_cleanup_plan_activity_type_enums.sql
-- Description: Remove duplicate swap enum values (participant_swap, participant_swapped), mapping any historical entries to canonical participants_swapped.

-- 1. Create clean replacement enum type containing participants_swapped as the ONLY swap enum value
CREATE TYPE public.plan_activity_type_clean AS ENUM (
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

-- 2. Migrate any historical activity records using obsolete swap enum strings to participants_swapped
UPDATE public.plan_activity 
   SET activity_type = 'participants_swapped'::public.plan_activity_type_clean
 WHERE activity_type::text IN ('participant_swap', 'participant_swapped');

-- 3. Alter plan_activity.activity_type column to use the clean enum
ALTER TABLE public.plan_activity 
  ALTER COLUMN activity_type TYPE public.plan_activity_type_clean 
  USING (
    CASE 
      WHEN activity_type::text IN ('participant_swap', 'participant_swapped') THEN 'participants_swapped'::public.plan_activity_type_clean
      ELSE activity_type::text::public.plan_activity_type_clean
    END
  );

-- 4. Drop the old enum type
DROP TYPE public.plan_activity_type;

-- 5. Rename the clean enum type to plan_activity_type
ALTER TYPE public.plan_activity_type_clean RENAME TO plan_activity_type;
