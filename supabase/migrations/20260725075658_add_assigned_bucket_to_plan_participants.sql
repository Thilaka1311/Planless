-- Migration: Add assigned_bucket column to plan_participants table
-- Description: Stores the host pre-assignment ('GOING' or 'WAITLIST') for Assigned mode

ALTER TABLE public.plan_participants
ADD COLUMN IF NOT EXISTS assigned_bucket VARCHAR(20) DEFAULT 'GOING';

-- Default existing rows based on rsvp_status
UPDATE public.plan_participants
SET assigned_bucket = 'WAITLIST'
WHERE rsvp_status = 'WAITLISTED';
