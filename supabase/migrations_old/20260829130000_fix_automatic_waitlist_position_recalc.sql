-- Migration: Fix Automatic Waitlist Position Invariant & Recalculation
-- Description: 1. Updates rebuild_waitlist_queue to properly clear positions for JOINED/INVITED automatic participants.
--              2. Updates auto_promote_waitlist_for_automatic to clear waitlist_position explicitly and call rebuild_waitlist_queue.
--              3. Purges any existing corrupt waitlist_position data for automatic participants.

-- 1. Update rebuild_waitlist_queue
CREATE OR REPLACE FUNCTION public.rebuild_waitlist_queue(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_mode waitlist_order_mode_enum := 'AUTO'::waitlist_order_mode_enum;
  v_rec RECORD;
  v_seq INT := 1;
BEGIN
  -- Fetch plan order mode
  SELECT waitlist_order_mode INTO v_order_mode
    FROM public.plans
   WHERE id = p_plan_id;

  -- Step 1: Clear waitlist_position for any participant who shouldn't have one
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (
       assigned_group = 'GOING'::assigned_group_enum
       OR rsvp_status IN ('SKIPPED'::rsvp_status, 'INVITED'::rsvp_status)
       OR (assigned_group IS NULL AND rsvp_status != 'WAITLISTED'::rsvp_status)
     )
     AND waitlist_position IS NOT NULL;

  -- Step 2: Renumber all active waitlist participants contiguously 1..N
  FOR v_rec IN
    SELECT id
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND rsvp_status != 'SKIPPED'::rsvp_status
       AND (assigned_group = 'WAITLIST'::assigned_group_enum OR (assigned_group IS NULL AND rsvp_status = 'WAITLISTED'::rsvp_status))
     ORDER BY
       CASE WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum THEN COALESCE(waitlist_position, 2147483647) ELSE 2147483647 END ASC,
       COALESCE(join_queue, 2147483647) ASC,
       COALESCE(joined_queue_at, created_at) ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE id = v_rec.id;

    v_seq := v_seq + 1;
  END LOOP;
END;
$$;


-- 2. Update auto_promote_waitlist_for_automatic
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
           waitlist_position = NULL,
           assigned_group = NULL,
           responded_at = now(),
           updated_at   = now()
     WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

    v_promoted := v_promoted + 1;
  END LOOP;
  
  -- Recalculate remaining waitlist positions if any promotions occurred
  IF v_promoted > 0 THEN
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN v_promoted;
END;
$$;


-- 3. Data Cleanup
UPDATE public.plan_participants
   SET waitlist_position = NULL
 WHERE assigned_group IS NULL 
   AND rsvp_status != 'WAITLISTED'::rsvp_status
   AND waitlist_position IS NOT NULL;
