-- Migration: 20261014180000_fix_participant_state_integrity_and_deadlocks.sql
-- Description:
-- 1. Updates remove_and_replace_participant to eliminate hard DELETE, safely transitioning
--    the removed participant to rsvp_status = 'SKIPPED' with skip_reason = 'REPLACED',
--    preserving historical participation and expenses, locking plans FOR UPDATE first,
--    and safely renumbering remaining waitlist candidates without unique key collisions.
-- 2. Updates update_plan_capacity to lock public.plans FOR UPDATE first, adhering to the
--    canonical lock acquisition order (Principle 32) and eliminating 40P01 deadlock hazards.

-- ============================================================================
-- 1. Update remove_and_replace_participant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_and_replace_participant(
  p_plan_id uuid,
  p_remove_user_id uuid,
  p_promote_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id            UUID;
  v_filtering_mode       participant_filtering_type;
  v_target_row           RECORD;
  v_replacement_row      RECORD;
  v_replacement_prev_pos INT := NULL;
  v_remaining_hosts      INT;
BEGIN
  -- 1. Identify caller and verify authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller host authorization
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: only the host can manage participants' USING ERRCODE = '40300';
  END IF;

  -- 3. Standardize lock order: lock plan FOR UPDATE first (Principle 32)
  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Lock target participant row
  SELECT role, assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_remove_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
    RAISE EXCEPTION 'Target participant has already left the plan' USING ERRCODE = '40000';
  END IF;

  -- 5. Prevent leaving plan orphaned if target is sole host
  IF v_target_row.role = 'HOST'::participant_role THEN
    SELECT COUNT(*) INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status != 'SKIPPED'::rsvp_status
       AND user_id != p_remove_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot replace the sole host. Promote another host first.' USING ERRCODE = '40000';
    END IF;
  END IF;

  -- 6. Lock replacement participant row
  SELECT role, assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement participant not found' USING ERRCODE = '40400';
  END IF;

  v_replacement_prev_pos := v_replacement_row.waitlist_position;

  -- 7. Soft-delete target participant (NEVER hard DELETE)
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'REPLACED'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_remove_user_id;

  -- 8. Promote replacement participant to GOING
  -- Preserve INVITED if they haven't accepted yet; otherwise transition to JOINED
  UPDATE public.plan_participants
     SET assigned_group    = CASE
                               WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                               ELSE NULL
                             END,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_replacement_row.rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                               ELSE 'JOINED'::rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested   = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id;

  -- 9. Renumber remaining waitlist contiguously using collision-free 2-stage offset staging
  IF v_replacement_prev_pos IS NOT NULL THEN
    UPDATE public.plan_participants
       SET waitlist_position = waitlist_position + 10000
     WHERE plan_id = p_plan_id
       AND waitlist_position IS NOT NULL
       AND user_id != p_promote_user_id;

    UPDATE public.plan_participants pp
       SET waitlist_position = rd.new_pos,
           updated_at        = now()
      FROM (
        SELECT user_id,
               ROW_NUMBER() OVER (
                 ORDER BY (waitlist_position - 10000) ASC, created_at ASC
               ) AS new_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND waitlist_position IS NOT NULL
           AND user_id != p_promote_user_id
           AND rsvp_status != 'SKIPPED'::rsvp_status
      ) rd
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rd.user_id;
  END IF;

  -- 10. Recalculate expense splits for updated Going roster
  PERFORM public.recalculate_wallet_expenses(p_plan_id);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'removed_user_id',  p_remove_user_id,
    'promoted_user_id', p_promote_user_id
  );
END;
$$;

ALTER FUNCTION public.remove_and_replace_participant(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.remove_and_replace_participant(uuid, uuid, uuid) TO anon, authenticated, service_role;


-- ============================================================================
-- 2. Update update_plan_capacity to lock plans FOR UPDATE first (Principle 32)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id uuid,
  p_plan_size integer,
  p_auto_promote boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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

  -- Standardize lock order: lock plan FOR UPDATE first (Principle 32)
  SELECT participant_filtering::TEXT
    INTO v_filtering
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_plan_size IS NULL OR p_plan_size < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  -- If plan was previously No Limit (participant_filtering IS NULL), setting a capacity sets participant_filtering to AUTOMATIC
  IF v_filtering IS NULL THEN
    v_filtering := 'AUTOMATIC';
    UPDATE public.plans
       SET plan_size = p_plan_size,
           participant_filtering = 'AUTOMATIC'::participant_filtering_type,
           updated_at = now()
     WHERE id = p_plan_id;
  ELSE
    UPDATE public.plans
       SET plan_size   = p_plan_size,
           updated_at  = now()
     WHERE id = p_plan_id;
  END IF;

  IF v_filtering = 'ASSIGNED' THEN
    IF COALESCE(p_auto_promote, true) THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      IF v_current_going < p_plan_size THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, 'GOING'::assigned_group_enum);
      ELSIF v_current_going > p_plan_size THEN
        SELECT COUNT(*) INTO v_host_count
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND role = 'HOST'::participant_role
           AND assigned_group = 'GOING'::assigned_group_enum
           AND rsvp_status != 'SKIPPED'::rsvp_status;

        WITH ranked_going AS (
          SELECT pp.user_id,
                 ROW_NUMBER() OVER (
                   ORDER BY pp.joined_queue_at ASC NULLS LAST,
                            COALESCE(u.full_name, u.username, '') ASC
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
               waitlist_position = 2147483647,
               updated_at        = now()
          FROM ranked_going rg
         WHERE pp.plan_id = p_plan_id
           AND pp.user_id = rg.user_id
           AND rg.pos > GREATEST(0, p_plan_size - v_host_count);

        GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);
      END IF;
    END IF;

    PERFORM public.recalculate_wallet_expenses(p_plan_id);
  ELSE
    -- Automatic mode:
    IF COALESCE(p_auto_promote, true) THEN
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

      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

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
$$;

ALTER FUNCTION public.update_plan_capacity(uuid, integer, boolean) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer, boolean) TO anon, authenticated, service_role;
