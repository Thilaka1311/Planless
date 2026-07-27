-- Migration: Add assigned_group column to plan_participants table
-- Description: Stores the host assignment ('GOING' or 'WAITLIST') separately from rsvp_status.
--              Nullable; remains NULL for Automatic mode plans.

ALTER TABLE public.plan_participants
ADD COLUMN IF NOT EXISTS assigned_group VARCHAR(20) DEFAULT NULL;

-- Backfill assigned_group for existing Assigned mode plans based on existing assigned_bucket / rsvp_status
UPDATE public.plan_participants pp
SET assigned_group = CASE
  WHEN pp.assigned_bucket = 'WAITLIST' OR pp.rsvp_status = 'WAITLISTED' THEN 'WAITLIST'
  ELSE 'GOING'
END
FROM public.plans p
WHERE pp.plan_id = p.id
  AND p.participant_filtering = 'ASSIGNED';
