-- ============================================================================
-- Migration: Auto recalculate participant costs on plan cost or capacity update
-- Description: Ensures cost_per_participant is always derived as (total_cost / max_participants)
--              for active (JOINED) participants, and NULL for all non-joined participants.
-- ============================================================================

-- 1. Create function to sync participant cost share on plan total_cost or max_participants change
CREATE OR REPLACE FUNCTION public.sync_plan_participant_cost_share()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_share NUMERIC(10,2) := 0;
BEGIN
  -- Compute per participant share from NEW total_cost and max_participants
  IF NEW.total_cost IS NOT NULL AND NEW.total_cost > 0 AND NEW.max_participants IS NOT NULL AND NEW.max_participants > 0 THEN
    v_share := ROUND(NEW.total_cost / NEW.max_participants, 2);
  ELSE
    v_share := 0;
  END IF;

  -- Update active (JOINED) participants
  UPDATE public.plan_participants
     SET cost_per_participant = v_share,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status = 'JOINED'::rsvp_status;

  -- Clear non-active participants
  UPDATE public.plan_participants
     SET cost_per_participant = NULL,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status != 'JOINED'::rsvp_status;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present and recreate
DROP TRIGGER IF EXISTS trigger_sync_plan_participant_cost_share ON public.plans;

CREATE TRIGGER trigger_sync_plan_participant_cost_share
  AFTER UPDATE OF total_cost, max_participants ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_participant_cost_share();

-- 2. Create function to set cost_per_participant when a user joins or changes rsvp_status
CREATE OR REPLACE FUNCTION public.set_participant_cost_share_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_cost NUMERIC(10,2);
  v_max_participants INT;
BEGIN
  IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT total_cost, max_participants
      INTO v_total_cost, v_max_participants
      FROM public.plans
     WHERE id = NEW.plan_id;

    IF v_total_cost IS NOT NULL AND v_total_cost > 0 AND v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
      NEW.cost_per_participant := ROUND(v_total_cost / v_max_participants, 2);
    ELSE
      NEW.cost_per_participant := 0;
    END IF;
  ELSE
    NEW.cost_per_participant := NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if present and recreate
DROP TRIGGER IF EXISTS trigger_set_participant_cost_share_on_join ON public.plan_participants;

CREATE TRIGGER trigger_set_participant_cost_share_on_join
  BEFORE INSERT OR UPDATE OF rsvp_status ON public.plan_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_participant_cost_share_on_join();
