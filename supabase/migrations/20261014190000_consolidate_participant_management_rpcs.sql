-- Migration: 20261014190000_consolidate_participant_management_rpcs.sql
-- Description:
-- 1. Introduces unified domain RPC public.manage_plan_participant(plan_id, action, target_user, secondary_user, options)
--    covering REMOVE, REPLACE, SWAP, MOVE_TO_GOING, and MOVE_TO_WAITLIST.
-- 2. Standardizes canonical lock acquisition order (plans FOR UPDATE first) and atomic wallet recalculations.
-- 3. Provides 100% backward-compatible wrapper shims for existing RPCs:
--    - remove_participant(uuid, uuid)
--    - replace_participant(uuid, uuid, uuid)
--    - remove_and_replace_participant(uuid, uuid, uuid)
--    - swap_plan_participants(uuid, uuid, uuid)
--    - move_participant_to_waitlist_and_decrease_capacity(uuid, uuid)
-- 4. Updates leave_plan(uuid) to lock public.plans FOR UPDATE first (Principle 32).

-- ============================================================================
-- 1. Unified Domain RPC: manage_plan_participant
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_plan_participant(
  p_plan_id uuid,
  p_action text,
  p_target_user_id uuid,
  p_secondary_user_id uuid DEFAULT NULL,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id              UUID;
  v_filtering_mode         participant_filtering_type;
  v_plan_size              INT;
  v_new_plan_size          INT;
  v_target_row             RECORD;
  v_secondary_row          RECORD;
  v_remaining_hosts        INT;
  v_promoted_count         INT := 0;
  v_action                 TEXT;
  v_vacated_pos            INT;
  v_next_pos               INT;
BEGIN
  -- 1. Identify caller and verify authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller host authorization
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: only hosts can manage participants' USING ERRCODE = '40300';
  END IF;

  v_action := UPPER(TRIM(p_action));

  -- 3. Canonical lock order: lock plan FOR UPDATE first (Principle 32)
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Lock target participant row
  SELECT role, assigned_group, rsvp_status, waitlist_position, COALESCE(leave_requested, false) AS leave_requested
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  -- 5. Branch by action:
  CASE v_action

    -- =========================================================================
    -- ACTION: REMOVE
    -- =========================================================================
    WHEN 'REMOVE' THEN
      -- Idempotency check: If participant is already SKIPPED, return immediately
      IF v_target_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
        RETURN jsonb_build_object(
          'success', true,
          'action', 'REMOVE',
          'plan_id', p_plan_id,
          'user_id', p_target_user_id,
          'already_skipped', true,
          'plan_size', v_plan_size,
          'new_capacity', v_plan_size
        );
      END IF;

      -- Sole host protection
      IF v_target_row.role = 'HOST'::participant_role AND v_target_row.rsvp_status = 'JOINED'::rsvp_status THEN
        SELECT COUNT(*) INTO v_remaining_hosts
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND role = 'HOST'::participant_role
           AND rsvp_status = 'JOINED'::rsvp_status
           AND user_id <> p_target_user_id;

        IF v_remaining_hosts < 1 THEN
          RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
        END IF;
      END IF;

      PERFORM set_config('app.system_op', 'true', true);

      -- Soft-delete participant (never drop row)
      UPDATE public.plan_participants
         SET rsvp_status        = 'SKIPPED'::rsvp_status,
             skip_reason        = 'REMOVED'::skip_reason,
             assigned_group     = NULL,
             waitlist_position  = NULL,
             joined_queue_at    = NULL,
             role               = 'PARTICIPANT'::participant_role,
             leave_requested    = FALSE,
             leave_requested_at = NULL,
             responded_at       = now(),
             updated_at         = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      -- Sync invited_participants count
      UPDATE public.plans
         SET invited_participants = (
           SELECT COUNT(*) FROM public.plan_participants
            WHERE plan_id = p_plan_id AND rsvp_status != 'SKIPPED'::rsvp_status
         ),
         updated_at = now()
       WHERE id = p_plan_id;

      -- Mode-specific capacity decrement and promotion
      IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
        IF v_plan_size IS NOT NULL AND v_target_row.rsvp_status = 'JOINED'::rsvp_status THEN
          v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
        END IF;
      ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
        -- Principle 31: Decrement plan_size when removing from GOING in Assigned mode
        IF v_target_row.assigned_group = 'GOING'::assigned_group_enum OR v_target_row.assigned_group IS NULL THEN
          IF v_plan_size IS NOT NULL THEN
            v_new_plan_size := GREATEST(1, v_plan_size - 1);
            UPDATE public.plans SET plan_size = v_new_plan_size, updated_at = now() WHERE id = p_plan_id;
            v_plan_size := v_new_plan_size;
          END IF;
        END IF;

        IF v_target_row.assigned_group IS NOT NULL THEN
          v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_row.assigned_group);
        END IF;
      END IF;

      PERFORM set_config('app.system_op', 'false', true);

      RETURN jsonb_build_object(
        'success', true,
        'action', 'REMOVE',
        'plan_id', p_plan_id,
        'user_id', p_target_user_id,
        'skip_reason', 'REMOVED',
        'promoted_count', v_promoted_count,
        'plan_size', v_plan_size,
        'new_capacity', v_plan_size
      );

    -- =========================================================================
    -- ACTION: REPLACE
    -- =========================================================================
    WHEN 'REPLACE' THEN
      IF p_secondary_user_id IS NULL THEN
        RAISE EXCEPTION 'Replacement user ID is required' USING ERRCODE = '42601';
      END IF;

      IF v_target_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
        RAISE EXCEPTION 'Target participant has already left the plan' USING ERRCODE = '40000';
      END IF;

      -- Sole host protection
      IF v_target_row.role = 'HOST'::participant_role THEN
        SELECT COUNT(*) INTO v_remaining_hosts
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND role = 'HOST'::participant_role
           AND rsvp_status != 'SKIPPED'::rsvp_status
           AND user_id <> p_target_user_id;

        IF v_remaining_hosts < 1 THEN
          RAISE EXCEPTION 'Cannot replace the sole host. Promote another host first.' USING ERRCODE = '40000';
        END IF;
      END IF;

      -- Lock replacement row
      SELECT role, assigned_group, rsvp_status, waitlist_position
        INTO v_secondary_row
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = p_secondary_user_id
         FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Replacement participant not found in plan' USING ERRCODE = '40400';
      END IF;

      v_vacated_pos := v_secondary_row.waitlist_position;

      -- Soft-delete target participant
      UPDATE public.plan_participants
         SET rsvp_status        = 'SKIPPED'::rsvp_status,
             skip_reason        = 'REPLACED'::skip_reason,
             assigned_group     = NULL,
             waitlist_position  = NULL,
             leave_requested    = FALSE,
             leave_requested_at = NULL,
             updated_at         = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      -- Promote replacement participant to GOING
      UPDATE public.plan_participants
         SET assigned_group    = CASE
                                   WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                   ELSE NULL
                                 END,
             waitlist_position = NULL,
             rsvp_status       = CASE
                                   WHEN v_secondary_row.rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                   ELSE 'JOINED'::rsvp_status
                                 END,
             skip_reason       = NULL,
             leave_requested   = FALSE,
             leave_requested_at = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_secondary_user_id;

      -- Renumber remaining waitlist contiguously 1..N
      IF v_vacated_pos IS NOT NULL THEN
        UPDATE public.plan_participants
           SET waitlist_position = waitlist_position + 10000
         WHERE plan_id = p_plan_id
           AND waitlist_position IS NOT NULL
           AND user_id != p_secondary_user_id;

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
               AND user_id != p_secondary_user_id
               AND rsvp_status != 'SKIPPED'::rsvp_status
          ) rd
         WHERE pp.plan_id = p_plan_id
           AND pp.user_id = rd.user_id;
      END IF;

      PERFORM public.recalculate_wallet_expenses(p_plan_id);

      RETURN jsonb_build_object(
        'success', true,
        'action', 'REPLACE',
        'plan_id', p_plan_id,
        'removed_user_id', p_target_user_id,
        'target_user_id', p_target_user_id,
        'replacement_user_id', p_secondary_user_id,
        'promoted_user_id', p_secondary_user_id
      );

    -- =========================================================================
    -- ACTION: SWAP
    -- =========================================================================
    WHEN 'SWAP' THEN
      IF p_secondary_user_id IS NULL THEN
        RAISE EXCEPTION 'Waitlist user ID is required for swap' USING ERRCODE = '42601';
      END IF;

      SELECT role, assigned_group, rsvp_status, waitlist_position
        INTO v_secondary_row
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = p_secondary_user_id
         FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Waitlist participant not found' USING ERRCODE = '40400';
      END IF;

      IF v_target_row.assigned_group <> 'GOING'::assigned_group_enum THEN
        RAISE EXCEPTION 'Target participant is not in GOING group' USING ERRCODE = '40000';
      END IF;

      IF v_secondary_row.assigned_group <> 'WAITLIST'::assigned_group_enum THEN
        RAISE EXCEPTION 'Secondary participant is not in WAITLIST group' USING ERRCODE = '40000';
      END IF;

      IF v_target_row.rsvp_status = 'SKIPPED'::rsvp_status OR v_secondary_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
        RAISE EXCEPTION 'Cannot swap a skipped participant' USING ERRCODE = '40000';
      END IF;

      v_vacated_pos := v_secondary_row.waitlist_position;

      -- Swap positions atomically
      UPDATE public.plan_participants
         SET assigned_group    = 'GOING'::assigned_group_enum,
             rsvp_status       = CASE
                                   WHEN rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                                   ELSE rsvp_status
                                 END,
             waitlist_position = NULL,
             joined_queue_at   = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_secondary_user_id;

      UPDATE public.plan_participants
         SET assigned_group    = 'WAITLIST'::assigned_group_enum,
             rsvp_status       = CASE
                                   WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                                   ELSE rsvp_status
                                 END,
             waitlist_position = v_vacated_pos,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      PERFORM public.recalculate_wallet_expenses(p_plan_id);

      RETURN jsonb_build_object(
        'success', true,
        'action', 'SWAP',
        'plan_id', p_plan_id,
        'going_user_id', p_target_user_id,
        'waitlist_user_id', p_secondary_user_id,
        'swapped_waitlist_position', v_vacated_pos
      );

    -- =========================================================================
    -- ACTION: MOVE_TO_WAITLIST
    -- =========================================================================
    WHEN 'MOVE_TO_WAITLIST' THEN
      IF v_target_row.role = 'HOST'::participant_role THEN
        RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
      END IF;

      IF v_filtering_mode IS NULL THEN
        RAISE EXCEPTION 'Cannot move participants to waitlist on a No Limit plan' USING ERRCODE = '40000';
      END IF;

      SELECT COALESCE(MAX(waitlist_position), 0) + 1
        INTO v_next_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum;

      IF COALESCE((p_options->>'decrease_capacity')::boolean, false) THEN
        IF v_plan_size IS NOT NULL THEN
          v_new_plan_size := GREATEST(1, v_plan_size - 1);
          UPDATE public.plans SET plan_size = v_new_plan_size, updated_at = now() WHERE id = p_plan_id;
          v_plan_size := v_new_plan_size;
        END IF;
      END IF;

      UPDATE public.plan_participants
         SET assigned_group    = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'WAITLIST'::assigned_group_enum ELSE NULL END,
             waitlist_position = v_next_pos,
             rsvp_status       = CASE
                                   WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                                   ELSE rsvp_status
                                 END,
             skip_reason       = NULL,
             leave_requested    = FALSE,
             leave_requested_at = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      PERFORM public.recalculate_wallet_expenses(p_plan_id);

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MOVE_TO_WAITLIST',
        'plan_id', p_plan_id,
        'target_user_id', p_target_user_id,
        'waitlist_position', v_next_pos,
        'plan_size', v_plan_size
      );

    -- =========================================================================
    -- ACTION: MOVE_TO_GOING
    -- =========================================================================
    WHEN 'MOVE_TO_GOING' THEN
      v_vacated_pos := v_target_row.waitlist_position;

      UPDATE public.plan_participants
         SET assigned_group    = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
             waitlist_position = NULL,
             joined_queue_at   = NULL,
             rsvp_status       = CASE
                                   WHEN rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                   ELSE 'JOINED'::rsvp_status
                                 END,
             skip_reason       = NULL,
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

      IF v_vacated_pos IS NOT NULL THEN
        UPDATE public.plan_participants
           SET waitlist_position = waitlist_position + 10000
         WHERE plan_id = p_plan_id
           AND waitlist_position IS NOT NULL
           AND user_id != p_target_user_id;

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
               AND user_id != p_target_user_id
               AND rsvp_status != 'SKIPPED'::rsvp_status
          ) rd
         WHERE pp.plan_id = p_plan_id
           AND pp.user_id = rd.user_id;
      END IF;

      PERFORM public.recalculate_wallet_expenses(p_plan_id);

      RETURN jsonb_build_object(
        'success', true,
        'action', 'MOVE_TO_GOING',
        'plan_id', p_plan_id,
        'target_user_id', p_target_user_id,
        'assigned_group', CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING' ELSE NULL END,
        'rsvp_status', CASE WHEN v_target_row.rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED' ELSE 'JOINED' END
      );

    ELSE
      RAISE EXCEPTION 'Unknown participant placement action: %', p_action USING ERRCODE = '42601';
  END CASE;
END;
$$;

ALTER FUNCTION public.manage_plan_participant(uuid, text, uuid, uuid, jsonb) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.manage_plan_participant(uuid, text, uuid, uuid, jsonb) TO anon, authenticated, service_role;


-- ============================================================================
-- 2. Backward-Compatible Wrapper Shims
-- ============================================================================

-- Wrapper for remove_participant
CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.manage_plan_participant(p_plan_id, 'REMOVE', p_target_user_id);
END;
$$;

ALTER FUNCTION public.remove_participant(uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.remove_participant(uuid, uuid) TO anon, authenticated, service_role;


-- Wrapper for replace_participant
CREATE OR REPLACE FUNCTION public.replace_participant(p_plan_id uuid, p_target_user_id uuid, p_replacement_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.manage_plan_participant(p_plan_id, 'REPLACE', p_target_user_id, p_replacement_user_id);
END;
$$;

ALTER FUNCTION public.replace_participant(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.replace_participant(uuid, uuid, uuid) TO anon, authenticated, service_role;


-- Wrapper for remove_and_replace_participant
CREATE OR REPLACE FUNCTION public.remove_and_replace_participant(p_plan_id uuid, p_remove_user_id uuid, p_promote_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.manage_plan_participant(p_plan_id, 'REPLACE', p_remove_user_id, p_promote_user_id);
END;
$$;

ALTER FUNCTION public.remove_and_replace_participant(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.remove_and_replace_participant(uuid, uuid, uuid) TO anon, authenticated, service_role;


-- Wrapper for swap_plan_participants
CREATE OR REPLACE FUNCTION public.swap_plan_participants(p_plan_id uuid, p_going_user_id uuid, p_waitlist_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.manage_plan_participant(p_plan_id, 'SWAP', p_going_user_id, p_waitlist_user_id);
END;
$$;

ALTER FUNCTION public.swap_plan_participants(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.swap_plan_participants(uuid, uuid, uuid) TO anon, authenticated, service_role;


-- Wrapper for move_participant_to_waitlist_and_decrease_capacity
CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.manage_plan_participant(p_plan_id, 'MOVE_TO_WAITLIST', p_target_user_id, NULL, '{"decrease_capacity": true}'::jsonb);
END;
$$;

ALTER FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(uuid, uuid) TO anon, authenticated, service_role;


-- ============================================================================
-- 3. Update leave_plan to lock plans FOR UPDATE first (Principle 32)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_plan_size                INT;
  v_total_cost               NUMERIC;
  v_current_role             participant_role;
  v_current_rsvp             rsvp_status;
  v_vacated_group            assigned_group_enum;
  v_promoted_count           INT := 0;
  v_filtering_mode           participant_filtering_type;
  v_remaining_hosts          INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Lock plan row FOR UPDATE first to eliminate lock inversion with concurrent mutations
  SELECT plan_size, total_cost, participant_filtering
    INTO v_plan_size, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock target participant
  SELECT role, rsvp_status, assigned_group
    INTO v_current_role, v_current_rsvp, v_vacated_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- Last-host protection: Host cannot leave if they are the sole active host
  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot leave the plan as the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Soft delete participant
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'LEFT'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         joined_queue_at    = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         role               = 'PARTICIPANT'::participant_role,
         responded_at       = now(),
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- Sync invited_participants count
  UPDATE public.plans
     SET invited_participants = (
       SELECT COUNT(*)
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND rsvp_status != 'SKIPPED'::rsvp_status
     ),
     updated_at = now()
   WHERE id = p_plan_id;

  -- Waitlist promotion
  IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    IF v_plan_size IS NOT NULL AND v_current_rsvp = 'JOINED'::rsvp_status THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
    IF v_vacated_group IS NOT NULL THEN
      v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_vacated_group);
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  -- Recalculate wallet expenses
  PERFORM public.recalculate_wallet_expenses(p_plan_id);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          v_user_id,
    'skip_reason',      'LEFT',
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$function$;

ALTER FUNCTION public.leave_plan(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.leave_plan(uuid) TO anon, authenticated, service_role;
