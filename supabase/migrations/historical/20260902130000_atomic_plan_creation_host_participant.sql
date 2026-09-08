-- Migration: Atomic Plan Creation Host Participant
-- Description: Adds an AFTER INSERT trigger on public.plans to guarantee that creating a plan
-- atomically inserts the creator as a HOST + JOINED participant in the same database transaction.

CREATE OR REPLACE FUNCTION public.handle_new_plan_creator_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  v_creator_id := COALESCE(auth.uid(), NEW.host_id);
  
  IF v_creator_id IS NOT NULL THEN
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      v_creator_id,
      'HOST'::participant_role,
      'JOINED'::rsvp_status,
      CASE WHEN NEW.participant_filtering = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      now(),
      now(),
      now()
    )
    ON CONFLICT (plan_id, user_id) DO UPDATE
    SET role = 'HOST'::participant_role,
        rsvp_status = 'JOINED'::rsvp_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_insert_plan_host_participant ON public.plans;
CREATE TRIGGER trg_auto_insert_plan_host_participant
AFTER INSERT ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_plan_creator_participant();
