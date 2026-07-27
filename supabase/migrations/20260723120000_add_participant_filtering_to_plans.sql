-- ============================================================================
-- Migration: Add participant_filtering column to plans table
-- Description: Stores how participant filtering is managed for each plan (AUTOMATIC or ASSIGNED).
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'participant_filtering_type') THEN
    CREATE TYPE public.participant_filtering_type AS ENUM ('AUTOMATIC', 'ASSIGNED');
  END IF;
END
$$;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS participant_filtering public.participant_filtering_type NOT NULL DEFAULT 'AUTOMATIC'::public.participant_filtering_type;
