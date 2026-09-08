-- Migration: 20260801094000_bypass_trigger_on_host_participant_moves.sql
-- Description: Update log_plan_participant_activity trigger to ignore updates when assigned_group is explicitly set or when host management events occur.

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only react on UPDATE when rsvp_status actually changes
  IF TG_OP = 'UPDATE' AND OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
    
    -- Ignore host-initiated moves (which explicitly alter assigned_group or skip_reason = REMOVED)
    -- Host management routines insert dedicated participant_moved_to_going / participant_moved_to_waitlist / participant_removed records directly.
    IF (NEW.assigned_group IS NOT NULL AND OLD.assigned_group IS DISTINCT FROM NEW.assigned_group) THEN
      RETURN NEW;
    END IF;

    -- Transition 1: INVITED -> JOINED or WAITLISTED -> JOINED (Self RSVP / User initiated)
    IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_joined'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 2: INVITED -> WAITLISTED (Self RSVP / User initiated)
    ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_waitlisted'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 3: JOINED / WAITLISTED -> SKIPPED (Voluntary user leave only)
    ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status AND COALESCE(NEW.skip_reason, 'LEFT'::skip_reason) != 'REMOVED'::skip_reason THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_left'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
