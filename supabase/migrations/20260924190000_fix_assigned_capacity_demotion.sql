-- Migration: Support Assigned mode capacity decrease demotion in update_plan_capacity
-- Description: When plan_size decreases in ASSIGNED mode and p_auto_promote is true,
-- demote overflow non-host participants from GOING to WAITLIST, preserving INVITED status
-- and renumbering the waitlist contiguously.

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id uuid,
  p_plan_size integer,
  p_auto_promote boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id            UUID;
  v_filtering          TEXT;
  v_promoted_count     INT := 0;
  v_demoted_count      INT := 0;
  v_host_count         INT := 0;
  v_current_going      INT := 0;
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

  IF p_plan_size IS NULL OR p_plan_size < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  -- Update plan_size (the actual joined capacity)
  UPDATE public.plans
     SET plan_size   = p_plan_size,
         updated_at  = now()
   WHERE id = p_plan_id;

  IF v_filtering = 'ASSIGNED' THEN
    IF COALESCE(p_auto_promote, true) THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      IF p_plan_size < v_current_going THEN
        SELECT COUNT(*) INTO v_host_count
          FROM public.plan_participants
         WHERE plan_id = p_plan_id 
           AND role = 'HOST'::participant_role 
           AND assigned_group = 'GOING'::assigned_group_enum 
           AND rsvp_status != 'SKIPPED'::rsvp_status;

        -- Rank non-host GOING participants alphabetically
        WITH ranked_going AS (
          SELECT pp.user_id,
                 ROW_NUMBER() OVER (
                   ORDER BY COALESCE(u.full_name, u.username, '') ASC,
                            pp.created_at ASC
                 ) AS pos
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id
             AND pp.assigned_group = 'GOING'::assigned_group_enum
             AND pp.rsvp_status != 'SKIPPED'::rsvp_status
             AND pp.role != 'HOST'::participant_role
        )
        UPDATE public.plan_participants pp
           SET assigned_group    = 'WAITLIST'::assigned_group_enum,
               rsvp_status       = CASE
                                     WHEN pp.rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                                     ELSE pp.rsvp_status
                                   END,
               updated_at        = now()
          FROM ranked_going rg
         WHERE pp.plan_id = p_plan_id
           AND pp.user_id = rg.user_id
           AND rg.pos > GREATEST(0, p_plan_size - v_host_count);

        GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

        -- Rebuild / renumber waitlist positions contiguously 1..N
        WITH numbered AS (
          SELECT pp.user_id,
                 ROW_NUMBER() OVER (
                   ORDER BY
                     COALESCE(pp.waitlist_position, 2147483647) ASC,
                     CASE pp.rsvp_status
                       WHEN 'WAITLISTED'::rsvp_status THEN 1
                       WHEN 'REJOINED'::rsvp_status THEN 2
                       WHEN 'INVITED'::rsvp_status THEN 3
                       ELSE 4
                     END ASC,
                     pp.joined_queue_at ASC NULLS LAST,
                     pp.created_at ASC,
                     COALESCE(u.full_name, u.username, '') ASC
                 ) AS new_pos
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id 
             AND pp.rsvp_status != 'SKIPPED'::rsvp_status
             AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
        )
        UPDATE public.plan_participants pp
           SET waitlist_position = n.new_pos,
               updated_at        = CASE WHEN pp.waitlist_position IS DISTINCT FROM n.new_pos THEN now() ELSE pp.updated_at END
          FROM numbered n
         WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

      ELSE
        -- Capacity increased or equal: auto-promote waitlisted participants into GOING
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, 'GOING'::assigned_group_enum);
      END IF;
    END IF;

    -- Recalculate wallet expenses if plan fee exists
    PERFORM public.recalculate_wallet_expenses(p_plan_id);
  ELSE
    -- Automatic mode:
    -- Only perform automated demotions/promotions if p_auto_promote is TRUE
    IF COALESCE(p_auto_promote, true) THEN
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
         AND rj.pos > GREATEST(0, p_plan_size - v_host_count);

      GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

      -- 2. Capacity increase: promote waitlisted participants if spots available (FCFS order)
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

      -- Recalculate waitlist queue positions
      PERFORM public.rebuild_waitlist_queue(p_plan_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_plan_size', p_plan_size,
    'plan_size', p_plan_size,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer, boolean) TO service_role;
