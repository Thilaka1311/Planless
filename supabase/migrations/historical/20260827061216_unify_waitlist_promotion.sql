-- Migration: Unify waitlist promotion logic for AUTOMATIC and ASSIGNED modes
-- Date: 2026-08-27

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_filtering      TEXT;
  v_max_p          INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
  v_waitlist_idx   INT := 1;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND OR v_max_p IS NULL OR v_max_p <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  -- Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max_p - v_joined_count;

  IF v_available <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  IF v_filtering = 'ASSIGNED' THEN
    -- Promote waitlisted participants based on waitlist_position
    FOR v_rec IN
      SELECT user_id, skip_reason
        FROM public.plan_participants
       WHERE plan_id = p_plan_id 
         AND rsvp_status = 'WAITLISTED'::rsvp_status
         AND assigned_group = 'WAITLIST'
       ORDER BY waitlist_position ASC NULLS LAST, joined_queue_at ASC, created_at ASC
       LIMIT v_available
    LOOP
      UPDATE public.plan_participants
         SET rsvp_status  = 'JOINED'::rsvp_status,
             skip_reason  = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
             assigned_group = 'GOING',
             waitlist_position = NULL,
             responded_at = now(),
             updated_at   = now()
       WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

      v_promoted := v_promoted + 1;
    END LOOP;

    -- Re-number the remaining WAITLIST participants sequentially starting from 1
    IF v_promoted > 0 THEN
      FOR v_rec IN
        SELECT user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id 
           AND rsvp_status = 'WAITLISTED'::rsvp_status
           AND assigned_group = 'WAITLIST'
         ORDER BY waitlist_position ASC NULLS LAST, joined_queue_at ASC, created_at ASC
      LOOP
        UPDATE public.plan_participants
           SET waitlist_position = v_waitlist_idx,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;
        
        v_waitlist_idx := v_waitlist_idx + 1;
      END LOOP;
    END IF;
  ELSE
    -- Promote waitlisted participants in FIFO queue order (joined_queue_at ASC)
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
  END IF;

  PERFORM set_config('app.system_op', 'false', true);
  RETURN v_promoted;
END;
$$;
