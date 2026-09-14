
CREATE OR REPLACE FUNCTION public.update_plan_capacity(p_plan_id uuid, p_max_participants integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id            UUID;
  v_filtering          TEXT;
  v_max_participants   INT;
  v_total_invited      INT;
  v_promoted_count     INT := 0;
  v_demoted_count      INT := 0;
  v_host_count         INT := 0;
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

  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  -- Ensure max_participants is at least total invited and at least the requested plan size
  SELECT COUNT(*)
    INTO v_total_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  IF v_max_participants IS NULL OR v_max_participants < GREATEST(COALESCE(v_total_invited, 0), p_max_participants) THEN
    v_max_participants := GREATEST(COALESCE(v_max_participants, 0), COALESCE(v_total_invited, 0), p_max_participants);
    UPDATE public.plans
       SET max_participants = v_max_participants,
           updated_at = now()
     WHERE id = p_plan_id;
  END IF;

  -- Update plan_size (the actual joined capacity)
  UPDATE public.plans
     SET plan_size   = p_max_participants,
         updated_at  = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    -- 1. Capacity decrease: demote overflow JOINED participants to WAITLISTED
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
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

    -- Recalculate waitlist queue positions
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_plan_size', p_max_participants,
    'max_participants', v_max_participants,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$function$;
