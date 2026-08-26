-- Migration: Enforce plan_participants final_attendance and final_state lifecycle
-- Description: Ensures final_attendance and final_state are only non-NULL when plans.status = 'COMPLETED'.
-- Resets final_attendance = NULL and final_state = NULL on plan_participants whenever a plan transitions to LIVE or any non-COMPLETED state.

CREATE OR REPLACE FUNCTION public.enforce_plan_participants_completion_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If plan status transitions to anything other than COMPLETED (e.g. LIVE or CANCELLED)
  IF NEW.status IS DISTINCT FROM 'COMPLETED'::plan_status THEN
    UPDATE public.plan_participants
    SET final_attendance = NULL,
        final_state = NULL
    WHERE plan_id = NEW.id
      AND (final_attendance IS NOT NULL OR final_state IS NOT NULL);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on plans table
DROP TRIGGER IF EXISTS trigger_enforce_plan_participants_completion_lifecycle ON public.plans;

CREATE TRIGGER trigger_enforce_plan_participants_completion_lifecycle
AFTER INSERT OR UPDATE OF status ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.enforce_plan_participants_completion_lifecycle();
