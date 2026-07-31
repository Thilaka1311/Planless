-- Migration: Enforce waitlist_position NULL for GOING and SKIPPED participants
-- Description: Ensures trg_enforce_waitlist_position_invariant trigger automatically sets
--              waitlist_position = NULL whenever assigned_group is 'GOING' or rsvp_status is 'SKIPPED'.

CREATE OR REPLACE FUNCTION public.trg_enforce_waitlist_position_invariant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.assigned_group = 'GOING'::assigned_group_enum OR NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
    NEW.waitlist_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_waitlist_position_invariant_trigger ON public.plan_participants;
CREATE TRIGGER trg_enforce_waitlist_position_invariant_trigger
BEFORE INSERT OR UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_enforce_waitlist_position_invariant();

-- Backfill: Clear waitlist_position for any existing participant in GOING or SKIPPED
UPDATE public.plan_participants
   SET waitlist_position = NULL
 WHERE assigned_group = 'GOING'::assigned_group_enum OR rsvp_status = 'SKIPPED'::rsvp_status;
