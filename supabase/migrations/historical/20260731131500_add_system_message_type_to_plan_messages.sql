-- Migration: 20260731131500_add_system_message_type_to_plan_messages.sql
-- Description: Create system_message_type enum and add system_message_type column with CHECK constraint to plan_messages table.

-- 1. CREATE ENUM TYPE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'system_message_type') THEN
    CREATE TYPE public.system_message_type AS ENUM (
      'plan_created',
      'participant_joined',
      'participant_left',
      'title_changed',
      'description_changed',
      'date_changed',
      'time_changed',
      'venue_changed',
      'plan_cancelled',
      'plan_restored',
      'plan_completed'
    );
  END IF;
END $$;

-- 2. ADD COLUMN TO PLAN_MESSAGES
ALTER TABLE public.plan_messages
  ADD COLUMN IF NOT EXISTS system_message_type public.system_message_type DEFAULT NULL;

-- 3. ADD CHECK CONSTRAINT FOR SYSTEM MESSAGE TYPE INVARIANTS
ALTER TABLE public.plan_messages
  DROP CONSTRAINT IF EXISTS check_system_message_type_invariant;

ALTER TABLE public.plan_messages
  ADD CONSTRAINT check_system_message_type_invariant
  CHECK (
    (message_type = 'system' AND system_message_type IS NOT NULL) OR
    (message_type IN ('text', 'poll') AND system_message_type IS NULL)
  );

-- 4. DOCUMENTATION COMMENT
COMMENT ON COLUMN public.plan_messages.system_message_type IS 'Specific system event type when message_type = ''system''. NULL for text and poll messages.';
