-- Migration: 20260801090000_automate_plan_activity_trigger.sql
-- Description: Create database trigger on public.plan_participants to automatically log all participant state transitions into public.plan_activity.

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  -- Determine actor_id (current authenticated user or falling back to participant user)
  v_actor_id := auth.uid();

  -- 1. INSERT (New Participant Record Created)
  IF TG_OP = 'INSERT' THEN
    IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
      -- Creator host join or direct join on creation
      IF NEW.role = 'HOST'::participant_role THEN
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (NEW.plan_id, NEW.user_id, NEW.user_id, 'plan_created'::plan_activity_type, jsonb_build_object('role', NEW.role));
      ELSE
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (NEW.plan_id, COALESCE(v_actor_id, NEW.user_id), NEW.user_id, 'participant_joined'::plan_activity_type, '{}'::jsonb);
      END IF;
    ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (NEW.plan_id, COALESCE(v_actor_id, NEW.user_id), NEW.user_id, 'participant_waitlisted'::plan_activity_type, '{}'::jsonb);
    ELSIF NEW.rsvp_status = 'INVITED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (NEW.plan_id, v_actor_id, NEW.user_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);
    END IF;
    RETURN NEW;
  END IF;

  -- 2. UPDATE (Participant RSVP Status Changed)
  IF TG_OP = 'UPDATE' THEN
    -- Only trigger if rsvp_status has actually changed
    IF OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
      IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
        -- Promoted from waitlist or joined directly from invited
        IF OLD.rsvp_status = 'WAITLISTED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (NEW.plan_id, v_actor_id, NEW.user_id, 'participant_promoted'::plan_activity_type, jsonb_build_object('from_status', OLD.rsvp_status));
        ELSE
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (NEW.plan_id, COALESCE(v_actor_id, NEW.user_id), NEW.user_id, 'participant_joined'::plan_activity_type, jsonb_build_object('from_status', OLD.rsvp_status));
        END IF;

      ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (NEW.plan_id, COALESCE(v_actor_id, NEW.user_id), NEW.user_id, 'participant_waitlisted'::plan_activity_type, jsonb_build_object('from_status', OLD.rsvp_status));

      ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
        IF NEW.skip_reason = 'REMOVED'::skip_reason THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (NEW.plan_id, v_actor_id, NEW.user_id, 'participant_removed'::plan_activity_type, jsonb_build_object('skip_reason', NEW.skip_reason));
        ELSE
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (NEW.plan_id, NEW.user_id, NEW.user_id, 'participant_left'::plan_activity_type, jsonb_build_object('skip_reason', NEW.skip_reason));
        END IF;

      ELSIF NEW.rsvp_status = 'INVITED'::rsvp_status THEN
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (NEW.plan_id, v_actor_id, NEW.user_id, 'participant_invited'::plan_activity_type, jsonb_build_object('from_status', OLD.rsvp_status));
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_plan_participant_activity ON public.plan_participants;

CREATE TRIGGER trg_log_plan_participant_activity
AFTER INSERT OR UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.log_plan_participant_activity();
