-- Migration: 20260731131000_convert_plan_messages_message_type_to_enum.sql
-- Description: Create message_type enum ('text', 'system', 'poll') and alter plan_messages.message_type column to use the enum.

-- 1. CREATE ENUM TYPE
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_type') THEN
    CREATE TYPE public.message_type AS ENUM ('text', 'system', 'poll');
  END IF;
END $$;

-- 2. ALTER COLUMN DATA TYPE AND SET DEFAULT
ALTER TABLE public.plan_messages
  ALTER COLUMN message_type DROP DEFAULT,
  ALTER COLUMN message_type TYPE public.message_type
    USING (
      CASE
        WHEN message_type IN ('text', 'system', 'poll') THEN message_type::public.message_type
        ELSE 'text'::public.message_type
      END
    ),
  ALTER COLUMN message_type SET DEFAULT 'text'::public.message_type,
  ALTER COLUMN message_type SET NOT NULL;

-- 3. DOCUMENTATION COMMENT
COMMENT ON COLUMN public.plan_messages.message_type IS 'Message payload type enum (text, system, poll). Defaults to text.';
