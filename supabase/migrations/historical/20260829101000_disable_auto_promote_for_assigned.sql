-- Migration: 20260829101000_disable_auto_promote_for_assigned.sql
-- Description: Ensure auto_promote_waitlist_for_automatic only runs on AUTOMATIC plans and preserves GUC system_op state.

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(p_plan_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_filtering      TEXT;
  v_max_p          INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
  v_was_system_op  TEXT;
BEGIN
  -- Save existing system_op setting to restore at the end
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  -- Do NOT auto-promote on ASSIGNED plans (Assigned waitlist is strictly host controlled)
  IF NOT FOUND OR v_filtering = 'ASSIGNED' OR v_max_p IS NULL OR v_max_p <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max_p - v_joined_count;

  IF v_available <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Promote waitlisted participants in FIFO queue order (joined_queue_at ASC) for AUTOMATIC plans
  FOR v_rec IN
    SELECT user_id, skip_reason
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY joined_queue_at ASC, created_at ASC
     LIMIT v_available
  LOOP
    UPDATE public.plan_participants
       SET rsvp_status  = 'JOINED'::rsvp_status,
           skip_reason  = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
           responded_at = now(),
           updated_at   = now()
     WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

    v_promoted := v_promoted + 1;
  END LOOP;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN v_promoted;
END;
$$;
