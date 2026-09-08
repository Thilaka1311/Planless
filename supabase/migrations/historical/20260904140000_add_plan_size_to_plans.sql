-- Migration: 20260904140000_add_plan_size_to_plans.sql
-- Description: Add plan_size column to plans table, decoupling invitation capacity (max_participants) from actual join capacity (plan_size).

-- 1. Add plan_size column if not exists
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_size INTEGER;

-- 2. Backfill existing plans: plan_size defaults to max_participants (or 10)
UPDATE public.plans
   SET plan_size = COALESCE(max_participants, 10)
 WHERE plan_size IS NULL;

-- Ensure max_participants is at least plan_size for existing records
UPDATE public.plans
   SET max_participants = COALESCE(max_participants, plan_size, 10)
 WHERE max_participants IS NULL OR max_participants < plan_size;

-- 3. Add constraint ensuring plan_size <= max_participants and plan_size >= 1
ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS check_plan_size_bounds;

ALTER TABLE public.plans
  ADD CONSTRAINT check_plan_size_bounds
  CHECK (plan_size IS NULL OR (plan_size >= 1 AND (max_participants IS NULL OR plan_size <= max_participants)));

-- 4. Update auto_promote_waitlist_for_automatic to use plan_size as actual join capacity
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(p_plan_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_filtering      TEXT;
  v_plan_size      INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
  v_was_system_op  TEXT;
BEGIN
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode and plan_size (join capacity)
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'),
         COALESCE(plan_size, max_participants)
    INTO v_filtering, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  -- Do NOT auto-promote on ASSIGNED plans or if plan_size is missing/invalid
  IF NOT FOUND OR v_filtering = 'ASSIGNED' OR v_plan_size IS NULL OR v_plan_size <= 0 THEN
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

  v_available := v_plan_size - v_joined_count;

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

-- 5. Update update_plan_capacity to update plan_size while preserving max_participants
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

  IF v_max_participants IS NOT NULL AND p_max_participants > v_max_participants THEN
    RAISE EXCEPTION 'Plan size (%) cannot exceed invitation capacity (%)', p_max_participants, v_max_participants USING ERRCODE = '42601';
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
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
