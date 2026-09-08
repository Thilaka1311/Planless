-- Description: Add joined_queue_at timestamp column to plan_participants table for Automatic Waitlist ordering.

ALTER TABLE public.plan_participants
ADD COLUMN IF NOT EXISTS joined_queue_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill joined_queue_at with created_at for existing records
UPDATE public.plan_participants
SET joined_queue_at = created_at
WHERE joined_queue_at IS NULL;
