-- 1. Update the existing preserve trigger so it doesn't block state transitions
CREATE OR REPLACE FUNCTION public.trg_preserve_payment_kept_skip_reason()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only preserve PAYMENT_KEPT if they are STILL in the SKIPPED state.
  -- If they are transitioning to JOINED, INVITED, etc., let it be cleared.
  IF OLD.skip_reason = 'PAYMENT_KEPT'::skip_reason 
     AND NEW.skip_reason IS NULL 
     AND NEW.rsvp_status = 'SKIPPED' THEN
    NEW.skip_reason := 'PAYMENT_KEPT'::skip_reason;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Create Trigger Function to clear skip reason on non-SKIPPED states
CREATE OR REPLACE FUNCTION public.trigger_enforce_skip_reason_null()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.rsvp_status IN ('JOINED', 'INVITED', 'WAITLISTED') THEN
        NEW.skip_reason = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger for the invariant
DROP TRIGGER IF EXISTS enforce_skip_reason_null_trigger ON public.plan_participants;
CREATE TRIGGER enforce_skip_reason_null_trigger
BEFORE INSERT OR UPDATE OF rsvp_status, skip_reason ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trigger_enforce_skip_reason_null();

-- 4. Fix existing data
UPDATE public.plan_participants
SET skip_reason = NULL
WHERE rsvp_status IN ('JOINED', 'INVITED', 'WAITLISTED')
  AND skip_reason IS NOT NULL;

-- 5. Add Constraint
ALTER TABLE public.plan_participants 
DROP CONSTRAINT IF EXISTS check_skip_reason_validity;

ALTER TABLE public.plan_participants 
ADD CONSTRAINT check_skip_reason_validity 
CHECK (rsvp_status = 'SKIPPED' OR skip_reason IS NULL);
