-- Migration: Make PAYMENT_KEPT skip_reason persistent across all participant status transitions and rejoins
-- Date: 2026-08-19

CREATE OR REPLACE FUNCTION trg_preserve_payment_kept_skip_reason()
RETURNS TRIGGER AS $$
BEGIN
  -- If OLD record had skip_reason = 'PAYMENT_KEPT', and NEW record is trying to set skip_reason to NULL,
  -- preserve PAYMENT_KEPT. Historical PAYMENT_KEPT status must never be erased automatically on status change/rejoin.
  IF OLD.skip_reason = 'PAYMENT_KEPT'::skip_reason AND NEW.skip_reason IS NULL THEN
    NEW.skip_reason := 'PAYMENT_KEPT'::skip_reason;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preserve_payment_kept_skip_reason_trigger ON plan_participants;

CREATE TRIGGER trg_preserve_payment_kept_skip_reason_trigger
BEFORE UPDATE ON plan_participants
FOR EACH ROW
EXECUTE FUNCTION trg_preserve_payment_kept_skip_reason();

-- Also update auto_promote_waitlist_for_automatic to preserve PAYMENT_KEPT
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
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND OR v_filtering <> 'AUTOMATIC' OR v_max_p IS NULL OR v_max_p <= 0 THEN
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

  PERFORM set_config('app.system_op', 'false', true);
  RETURN v_promoted;
END;
$$;
