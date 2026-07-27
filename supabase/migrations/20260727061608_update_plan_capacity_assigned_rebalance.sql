-- Migration: Update update_plan_capacity for Assigned mode rebalancing
-- Description: Ensures reducing capacity in Assigned mode rebalances assigned_group
--              from GOING to WAITLIST for newest non-host participants, preserving host invariant.

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id          UUID,
  p_max_participants INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID;
  v_creator_id     UUID;
  v_caller_role    participant_role;
  v_filtering      TEXT;
  v_promoted_count INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_creator_id, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  IF v_filtering = 'ASSIGNED' THEN
    -- Assigned mode capacity reduction:
    -- Displace newest non-host participants assigned to GOING (assigned_group = 'GOING')
    -- into WAITLIST (assigned_group = 'WAITLIST').
    -- Host (user_id = v_creator_id or role = 'HOST') is NEVER displaced.
    WITH ranked_going_assigned AS (
      SELECT user_id,
             ROW_NUMBER() OVER (
               ORDER BY
                 CASE WHEN user_id = v_creator_id OR role = 'HOST'::participant_role THEN 0 ELSE 1 END ASC,
                 joined_queue_at ASC NULLS LAST,
                 created_at ASC
             ) AS pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND rsvp_status != 'SKIPPED'::rsvp_status
         AND (assigned_group = 'GOING'::assigned_group_enum OR (assigned_group IS NULL AND rsvp_status != 'WAITLISTED'::rsvp_status))
    )
    UPDATE public.plan_participants pp
       SET assigned_group = 'WAITLIST'::assigned_group_enum,
           rsvp_status    = CASE WHEN pp.rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status ELSE pp.rsvp_status END,
           updated_at     = now()
      FROM ranked_going_assigned rga
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rga.user_id
       AND rga.pos > p_max_participants;
  ELSE
    -- Automatic mode capacity reduction: demote overflow Going → Waitlist
    WITH ranked_participants AS (
      SELECT user_id,
             ROW_NUMBER() OVER (
               ORDER BY
                 CASE WHEN user_id = v_creator_id OR role = 'HOST'::participant_role THEN 0 ELSE 1 END ASC,
                 joined_queue_at ASC NULLS LAST,
                 created_at ASC
             ) AS pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND rsvp_status = 'JOINED'::rsvp_status
    )
    UPDATE public.plan_participants pp
       SET rsvp_status = 'WAITLISTED'::rsvp_status,
           role        = CASE WHEN pp.user_id != v_creator_id THEN 'PARTICIPANT'::participant_role ELSE pp.role END,
           updated_at  = now()
      FROM ranked_participants rp
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rp.user_id
       AND rp.pos > p_max_participants;

    -- Capacity increase on AUTOMATIC plans: fill new slots from Waitlist
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants,
    'promoted_count',   v_promoted_count
  );
END;
$$;
