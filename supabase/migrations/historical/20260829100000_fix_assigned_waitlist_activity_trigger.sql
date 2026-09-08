-- Migration: 20260829100000_fix_assigned_waitlist_activity_trigger.sql
-- Description: Update log_plan_participant_activity trigger to detect assigned_group changes, properly logging host movements for INVITED participants without duplicating logs.

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_effective_actor_id UUID;
BEGIN
  -- React on UPDATE when rsvp_status OR assigned_group changes
  IF TG_OP = 'UPDATE' AND (OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status OR OLD.assigned_group IS DISTINCT FROM NEW.assigned_group) THEN

    IF (auth.uid() IS NOT NULL AND auth.uid() != NEW.user_id) OR current_setting('app.system_op', true) = 'true' THEN
      -- HOST / SYSTEM MOVEMENT
      v_effective_actor_id := COALESCE(
        NULLIF(auth.uid(), NEW.user_id),
        (SELECT host_id FROM public.plans WHERE id = NEW.plan_id)
      );

      IF (NEW.assigned_group = 'GOING' AND OLD.assigned_group IS DISTINCT FROM 'GOING') OR 
         (NEW.rsvp_status = 'JOINED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'JOINED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_joined'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'joined'
          )
        );

      ELSIF (NEW.assigned_group = 'WAITLIST' AND OLD.assigned_group IS DISTINCT FROM 'WAITLIST') OR 
            (NEW.rsvp_status = 'WAITLISTED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'WAITLISTED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_waitlist'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'waitlist'
          )
        );

      ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'SKIPPED'::rsvp_status THEN
        IF NEW.skip_reason = 'REMOVED'::skip_reason THEN
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
        END IF;
      END IF;

    ELSE
      -- VOLUNTARY PARTICIPANT ACTIONS
      -- Only log these if the RSVP status actually changed
      IF OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
        IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_joined'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_waitlisted'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
          IF NEW.skip_reason = 'REPLACED'::skip_reason THEN
            NULL;
          ELSIF OLD.rsvp_status = 'INVITED'::rsvp_status THEN
            INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
            VALUES (
              NEW.plan_id,
              NEW.user_id,
              NEW.user_id,
              'participant_skipped'::plan_activity_type,
              '{}'::jsonb
            );
          ELSE
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
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
