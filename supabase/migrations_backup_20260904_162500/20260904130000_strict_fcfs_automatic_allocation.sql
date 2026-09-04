-- Migration: Strict FCFS Automatic Participant Allocation & Name Fallback
-- Description: Ensures update_plan_capacity, auto_promote_waitlist_for_automatic, and rebuild_waitlist_queue
--              strictly prioritize joined_queue_at ASC, falling back to alphabetical user name ordering.

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

  -- Step 2: Renumber all active waitlist participants contiguously 1..N using FCFS + Alphabetical Fallback
  FOR v_rec IN
    SELECT pp.plan_id, pp.user_id
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id
       AND pp.rsvp_status != 'SKIPPED'::rsvp_status
       AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
     ORDER BY
       CASE WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum THEN COALESCE(pp.waitlist_position, 2147483647) ELSE 2147483647 END ASC,
       pp.joined_queue_at ASC NULLS LAST,
       COALESCE(u.full_name, u.username, '') ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE plan_id = v_rec.plan_id AND user_id = v_rec.user_id;

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
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  -- Do NOT auto-promote on ASSIGNED plans
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

  -- Promote waitlisted participants in FCFS queue order (joined_queue_at ASC, alphabetical name fallback)
  FOR v_rec IN
    SELECT pp.user_id, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id AND pp.rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY pp.joined_queue_at ASC NULLS LAST,
              COALESCE(u.full_name, u.username, '') ASC
     LIMIT v_available
  LOOP
    UPDATE public.plan_participants
       SET rsvp_status       = 'JOINED'::rsvp_status,
           skip_reason       = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
           waitlist_position = NULL,
           assigned_group    = NULL,
           responded_at      = now(),
           updated_at        = now()
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


-- 3. Update update_plan_capacity
CREATE OR REPLACE FUNCTION public.update_plan_capacity(p_plan_id uuid, p_max_participants integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id        UUID;
  v_filtering      TEXT;
  v_promoted_count INT := 0;
  v_demoted_count  INT := 0;
  v_host_count     INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    -- 1. Capacity decrease: demote overflow JOINED participants to WAITLISTED
    -- Order by joined_queue_at ASC NULLS LAST, user name ASC so earliest joiners keep their spots
    SELECT COUNT(*) INTO v_host_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status;

    WITH ranked_joined AS (
      SELECT pp.user_id,
             ROW_NUMBER() OVER (
               ORDER BY pp.joined_queue_at ASC NULLS LAST,
                        COALESCE(u.full_name, u.username, '') ASC
             ) AS pos
        FROM public.plan_participants pp
        LEFT JOIN public.users u ON u.id = pp.user_id
       WHERE pp.plan_id = p_plan_id
         AND pp.rsvp_status = 'JOINED'::rsvp_status
         AND pp.role != 'HOST'::participant_role
    )
    UPDATE public.plan_participants pp
       SET rsvp_status = 'WAITLISTED'::rsvp_status,
           updated_at  = now()
      FROM ranked_joined rj
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rj.user_id
       AND rj.pos > GREATEST(0, p_max_participants - v_host_count);

    GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

    -- 2. Capacity increase: promote waitlisted participants if spots available (FCFS order)
    SELECT COUNT(*) INTO v_promoted_count
      FROM public.auto_promote_waitlist_for_automatic(p_plan_id);

    -- Recalculate waitlist queue positions
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_capacity', p_max_participants,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
