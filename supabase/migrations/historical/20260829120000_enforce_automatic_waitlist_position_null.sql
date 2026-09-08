-- Migration: Enforce waitlist_position is NULL for non-waitlisted Automatic participants
-- Description: Updates trg_enforce_waitlist_position_invariant to strictly clear waitlist_position 
--              when an Automatic participant's rsvp_status is NOT 'WAITLISTED', and cleans up existing bad data.

CREATE OR REPLACE FUNCTION public.trg_enforce_waitlist_position_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Existing Assigned Waitlist behavior
  IF NEW.assigned_group = 'GOING'::assigned_group_enum OR NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
    NEW.waitlist_position := NULL;
  END IF;

  -- 2. New Automatic Waitlist behavior
  -- If assigned_group is NULL (Automatic invariant) and they are NOT WAITLISTED
  IF NEW.assigned_group IS NULL AND NEW.rsvp_status != 'WAITLISTED'::rsvp_status THEN
    NEW.waitlist_position := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and recreate the trigger to ensure it's up to date
DROP TRIGGER IF EXISTS trg_enforce_waitlist_position_invariant_trigger ON public.plan_participants;
CREATE TRIGGER trg_enforce_waitlist_position_invariant_trigger
BEFORE INSERT OR UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_waitlist_position_invariant();

-- Backfill: Clear waitlist_position for any existing Automatic participant who is not waitlisted
UPDATE public.plan_participants
   SET waitlist_position = NULL
 WHERE assigned_group IS NULL 
   AND rsvp_status != 'WAITLISTED'::rsvp_status
   AND waitlist_position IS NOT NULL;
