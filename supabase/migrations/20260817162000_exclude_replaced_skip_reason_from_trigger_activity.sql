-- Migration: Exclude REPLACED skip_reason from generating raw participant_left activity in trigger
-- Description: Updates public.log_plan_participant_activity to check that NEW.skip_reason is not REPLACED before inserting participant_left activity.

CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only react on UPDATE when rsvp_status actually changes
  IF TG_OP = 'UPDATE' AND OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
    
    -- Transition 1: INVITED -> JOINED or WAITLISTED -> JOINED (All map to participant_joined)
    IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_joined'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 2: INVITED -> WAITLISTED
    ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_waitlisted'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 3: JOINED / WAITLISTED -> SKIPPED
    -- Exclude REMOVED (handled in remove_participant RPC) AND REPLACED (handled in resolve_paid_plan_leave_request RPC)
    ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status
      AND COALESCE(NEW.skip_reason, 'LEFT'::skip_reason) NOT IN ('REMOVED'::skip_reason, 'REPLACED'::skip_reason) THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_left'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status, 'skip_reason', NEW.skip_reason)
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;
