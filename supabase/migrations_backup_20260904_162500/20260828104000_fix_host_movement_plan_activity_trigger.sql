-- Migration: 20260828104000_fix_host_movement_plan_activity_trigger.sql
-- Description: Refactor log_plan_participant_activity trigger function to distinguish voluntary participant RSVP actions from host-managed movements, inserting participant_moved_to_joined or participant_moved_to_waitlist for host actions, and participant_joined, participant_waitlisted, participant_skipped for voluntary participant actions.

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_effective_actor_id UUID;
BEGIN
  -- Only react on UPDATE when rsvp_status actually changes
  IF TG_OP = 'UPDATE' AND OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN

    -- Scenario 1: Transition to JOINED
    IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
      IF (auth.uid() IS NOT NULL AND auth.uid() != NEW.user_id) OR current_setting('app.system_op', true) = 'true' THEN
        -- HOST MOVEMENT to Joined
        v_effective_actor_id := COALESCE(
          NULLIF(auth.uid(), NEW.user_id),
          (SELECT host_id FROM public.plans WHERE id = NEW.plan_id)
        );

        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_joined'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(OLD.rsvp_status::text),
            'to', 'joined'
          )
        );
      ELSE
        -- VOLUNTARY participant join
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          NEW.user_id,
          NEW.user_id,
          'participant_joined'::plan_activity_type,
          '{}'::jsonb
        );
      END IF;

    -- Scenario 2: Transition to WAITLISTED
    ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      IF (auth.uid() IS NOT NULL AND auth.uid() != NEW.user_id) OR current_setting('app.system_op', true) = 'true' THEN
        -- HOST MOVEMENT to Waitlist
        v_effective_actor_id := COALESCE(
          NULLIF(auth.uid(), NEW.user_id),
          (SELECT host_id FROM public.plans WHERE id = NEW.plan_id)
        );

        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_waitlist'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(OLD.rsvp_status::text),
            'to', 'waitlist'
          )
        );
      ELSE
        -- VOLUNTARY participant join waitlist
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          NEW.user_id,
          NEW.user_id,
          'participant_waitlisted'::plan_activity_type,
          '{}'::jsonb
        );
      END IF;

    -- Scenario 3: Transition to SKIPPED
    ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
      IF NEW.skip_reason = 'REMOVED'::skip_reason THEN
        -- HOST REMOVAL
        v_effective_actor_id := COALESCE(
          NULLIF(auth.uid(), NEW.user_id),
          (SELECT host_id FROM public.plans WHERE id = NEW.plan_id)
        );

        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_removed'::plan_activity_type,
          '{}'::jsonb
        );
      ELSIF NEW.skip_reason = 'REPLACED'::skip_reason THEN
        -- Suppressed (handled in replacement RPC)
        NULL;
      ELSIF OLD.rsvp_status = 'INVITED'::rsvp_status THEN
        -- VOLUNTARY skip
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          NEW.user_id,
          NEW.user_id,
          'participant_skipped'::plan_activity_type,
          '{}'::jsonb
        );
      ELSE
        -- VOLUNTARY leave
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          NEW.user_id,
          NEW.user_id,
          'participant_left'::plan_activity_type,
          jsonb_build_object('resolution', NEW.skip_reason)
        );
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
