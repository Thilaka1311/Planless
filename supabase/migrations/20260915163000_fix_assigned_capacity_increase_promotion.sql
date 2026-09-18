-- Migration: Fix Assigned-mode capacity increase behavior and waitlist promotion
-- Description:
-- 1. Updates auto_promote_waitlist_for_assigned to:
--    - Promote enough participants to fill newly available capacity
--    - Differentiate INVITED vs WAITLISTED/REJOINED:
--      * INVITED: only assigned_group changes to GOING (rsvp_status remains INVITED)
--      * WAITLISTED / REJOINED: rsvp_status becomes JOINED and assigned_group becomes GOING
--      * waitlist_position becomes NULL for all promoted participants
--    - Preserve waitlist priority order:
--      * waitlist_position ASC NULLS LAST,
--      * CASE rsvp_status WHEN 'WAITLISTED' THEN 1 WHEN 'REJOINED' THEN 2 WHEN 'INVITED' THEN 3 ELSE 4 END ASC,
--      * joined_queue_at ASC NULLS LAST,
--      * created_at ASC,
--      * user full_name / username ASC
--    - Renumber remaining waitlist contiguously 1..N
-- 2. Updates update_plan_capacity to:
--    - Call auto_promote_waitlist_for_assigned on ASSIGNED plans
--    - Recalculate wallet expenses
--    - Maintain plan_size update and keep invited_participants unchanged
-- 3. Updates move_waitlist_to_going to preserve INVITED distinction and set assigned_group = GOING
-- 4. Updates rebuild_waitlist_queue to preserve assigned waitlist positions

-- ============================================================================
-- 1. AUTO_PROMOTE_WAITLIST_FOR_ASSIGNED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_assigned(
  p_plan_id uuid,
  p_vacated_group assigned_group_enum DEFAULT 'GOING'::assigned_group_enum
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filtering_mode   participant_filtering_type;
  v_plan_size        INT;
  v_current_going    INT;
  v_available_spots  INT;
  v_promoted_count   INT := 0;
  v_candidate        RECORD;
  v_order_mode       waitlist_order_mode_enum;
BEGIN
  -- 1. Verify plan exists and is ASSIGNED
  SELECT participant_filtering, plan_size, COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum)
    INTO v_filtering_mode, v_plan_size, v_order_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING or NULL (capacity increase / spot opened in GOING), attempt promotion
  IF p_vacated_group = 'GOING'::assigned_group_enum OR p_vacated_group IS NULL THEN
    IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      v_available_spots := GREATEST(0, v_plan_size - v_current_going);

      IF v_available_spots > 0 THEN
        -- Loop over waitlist candidates in strict priority order up to v_available_spots
        FOR v_candidate IN
          SELECT pp.user_id, pp.rsvp_status, pp.assigned_group, pp.waitlist_position
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id
             AND pp.rsvp_status != 'SKIPPED'::rsvp_status
             AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
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
           LIMIT v_available_spots
           FOR UPDATE OF pp
        LOOP
          IF v_candidate.rsvp_status = 'INVITED'::rsvp_status THEN
            -- Rule 2: INVITED participants:
            -- DO NOT change rsvp_status.
            -- ONLY change assigned_group to GOING.
            -- waitlist_position becomes NULL.
            UPDATE public.plan_participants
               SET assigned_group    = 'GOING'::assigned_group_enum,
                   waitlist_position = NULL,
                   updated_at        = now()
             WHERE plan_id = p_plan_id AND user_id = v_candidate.user_id;
          ELSE
            -- Rule 3: Accepted participants (WAITLISTED / REJOINED):
            -- Change BOTH: rsvp_status to JOINED and assigned_group to GOING.
            -- waitlist_position becomes NULL.
            UPDATE public.plan_participants
               SET rsvp_status       = 'JOINED'::rsvp_status,
                   assigned_group    = 'GOING'::assigned_group_enum,
                   waitlist_position = NULL,
                   updated_at        = now()
             WHERE plan_id = p_plan_id AND user_id = v_candidate.user_id;
          END IF;

          v_promoted_count := v_promoted_count + 1;
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
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

  RETURN v_promoted_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO service_role;

-- ============================================================================
-- 2. UPDATE_PLAN_CAPACITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_plan_capacity(p_plan_id uuid, p_plan_size integer)
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
  -- It must NOT update invited_participants.
  UPDATE public.plans
     SET plan_size   = p_plan_size,
         updated_at  = now()
   WHERE id = p_plan_id;

  IF v_filtering = 'ASSIGNED' THEN
    -- Assigned mode capacity increase:
    -- Promote enough waitlisted participants into GOING in priority order to fill newly available capacity
    v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, 'GOING'::assigned_group_enum);

    -- Recalculate wallet expenses if plan fee exists
    PERFORM public.recalculate_wallet_expenses(p_plan_id);
  ELSE
    -- Automatic mode:
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

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_capacity(uuid, integer) TO service_role;

-- ============================================================================
-- 3. MOVE_WAITLIST_TO_GOING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.move_waitlist_to_going(p_plan_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_plan_size          INT;
  v_target_status      rsvp_status;
  v_joined_count       INT := 0;
  v_filtering          TEXT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only hosts can move waitlisted participants into Going' USING ERRCODE = '40300';
  END IF;

  SELECT plan_size,
         COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_plan_size, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_filtering <> 'ASSIGNED' THEN
    RAISE EXCEPTION 'Manual queue movement is not allowed on Automatic plans'
      USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  -- Capacity check
  IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND assigned_group = 'GOING'::assigned_group_enum
       AND rsvp_status != 'SKIPPED'::rsvp_status;

    IF v_joined_count >= v_plan_size THEN
      RAISE EXCEPTION 'Going list is already full (% / %)', v_joined_count, v_plan_size
        USING ERRCODE = '40900';
    END IF;
  END IF;

  -- Distinction: INVITED remains INVITED, WAITLISTED becomes JOINED
  IF v_target_status = 'INVITED'::rsvp_status THEN
    UPDATE public.plan_participants
       SET assigned_group    = 'GOING'::assigned_group_enum,
           waitlist_position = NULL,
           skip_reason       = NULL,
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  ELSE
    UPDATE public.plan_participants
       SET rsvp_status       = 'JOINED'::rsvp_status,
           assigned_group    = 'GOING'::assigned_group_enum,
           waitlist_position = NULL,
           skip_reason       = NULL,
           responded_at      = COALESCE(responded_at, now()),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  END IF;

  -- Renumber remaining waitlist contiguously
  PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);

  -- Recalculate wallet expenses
  PERFORM public.recalculate_wallet_expenses(p_plan_id);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.move_waitlist_to_going(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.move_waitlist_to_going(uuid, uuid) TO service_role;

-- ============================================================================
-- 4. REBUILD_WAITLIST_QUEUE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_waitlist_queue(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order_mode waitlist_order_mode_enum := 'AUTO'::waitlist_order_mode_enum;
  v_filtering  participant_filtering_type := 'AUTOMATIC'::participant_filtering_type;
  v_rec        RECORD;
  v_seq        INT := 1;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- Fetch plan order mode and filtering
  SELECT COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum),
         COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type)
    INTO v_order_mode, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  -- Step 1: Clear waitlist_position for any participant who shouldn't have one
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (
       assigned_group = 'GOING'::assigned_group_enum
       OR rsvp_status = 'SKIPPED'::rsvp_status
       OR (v_filtering = 'AUTOMATIC'::participant_filtering_type AND rsvp_status != 'WAITLISTED'::rsvp_status)
       OR (v_filtering = 'ASSIGNED'::participant_filtering_type AND assigned_group IS DISTINCT FROM 'WAITLIST'::assigned_group_enum)
     )
     AND waitlist_position IS NOT NULL;

  -- Step 2: Renumber all active waitlist participants contiguously 1..N
  FOR v_rec IN
    SELECT pp.plan_id, pp.user_id
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id
       AND pp.rsvp_status != 'SKIPPED'::rsvp_status
       AND (
         (v_filtering = 'ASSIGNED'::participant_filtering_type AND pp.assigned_group = 'WAITLIST'::assigned_group_enum)
         OR (v_filtering = 'AUTOMATIC'::participant_filtering_type AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status)))
       )
     ORDER BY
       CASE 
         WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum OR v_filtering = 'ASSIGNED'::participant_filtering_type 
         THEN COALESCE(pp.waitlist_position, 2147483647) 
         ELSE 2147483647 
       END ASC,
       CASE pp.rsvp_status
         WHEN 'WAITLISTED'::rsvp_status THEN 1
         WHEN 'REJOINED'::rsvp_status THEN 2
         WHEN 'INVITED'::rsvp_status THEN 3
         ELSE 4
       END ASC,
       pp.joined_queue_at ASC NULLS LAST,
       pp.created_at ASC,
       COALESCE(u.full_name, u.username, '') ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE plan_id = v_rec.plan_id AND user_id = v_rec.user_id;

    v_seq := v_seq + 1;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rebuild_waitlist_queue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_waitlist_queue(uuid) TO service_role;
