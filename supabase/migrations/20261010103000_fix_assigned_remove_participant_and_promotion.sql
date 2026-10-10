-- Migration: 20261010103000_fix_assigned_remove_participant_and_promotion.sql
-- Description: 
--   1. Fixes 23505 duplicate key violations on idx_uniq_plan_waitlist_position using safe two-stage renumbering.
--   2. Ensures only eligible WAITLISTED / REJOINED participants are promoted to GOING/JOINED on vacancy.
--   3. Strictly preserves INVITED participants as INVITED in the Assigned waitlist without auto-joining them.
--   4. Updates remove_participant to set canonical skip_reason = 'REMOVED', clear assigned_group, waitlist_position, and queue metadata atomically.

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
  -- 1. Verify plan exists and is ASSIGNED (lock plan record for atomic coordination)
  SELECT participant_filtering, plan_size, COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum)
    INTO v_filtering_mode, v_plan_size, v_order_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING or NULL (capacity increase / spot opened in GOING), attempt promotion
  -- Only participants with rsvp_status IN ('WAITLISTED', 'REJOINED') are eligible to be promoted to GOING/JOINED.
  -- Participants with rsvp_status = 'INVITED' must NEVER be automatically promoted to JOINED or GOING.
  IF p_vacated_group = 'GOING'::assigned_group_enum OR p_vacated_group IS NULL THEN
    IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      v_available_spots := GREATEST(0, v_plan_size - v_current_going);

      IF v_available_spots > 0 THEN
        -- Loop over eligible waitlist candidates in strict priority order up to v_available_spots
        -- An invited participant (rsvp_status = 'INVITED') must NOT be promoted to JOINED or moved to GOING.
        FOR v_candidate IN
          SELECT pp.user_id, pp.rsvp_status, pp.assigned_group, pp.waitlist_position
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id
             AND pp.rsvp_status IN ('WAITLISTED'::rsvp_status, 'REJOINED'::rsvp_status)
             AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
           ORDER BY
             COALESCE(pp.waitlist_position, 2147483647) ASC,
             pp.joined_queue_at ASC NULLS LAST,
             pp.created_at ASC,
             COALESCE(u.full_name, u.username, '') ASC
           LIMIT v_available_spots
           FOR UPDATE OF pp
        LOOP
          UPDATE public.plan_participants
             SET rsvp_status       = 'JOINED'::rsvp_status,
                 assigned_group    = 'GOING'::assigned_group_enum,
                 waitlist_position = NULL,
                 joined_queue_at   = NULL,
                 updated_at        = now()
           WHERE plan_id = p_plan_id AND user_id = v_candidate.user_id;

          v_promoted_count := v_promoted_count + 1;
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
  -- To prevent 23505 duplicate key violations on idx_uniq_plan_waitlist_position,
  -- we perform a safe two-stage update using a temporary 10000-based offset.
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
     SET waitlist_position = 10000 + n.new_pos,
         assigned_group    = 'WAITLIST'::assigned_group_enum
    FROM numbered n
   WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

  -- Stage 2: Finalize 1-indexed contiguous positions
  UPDATE public.plan_participants pp
     SET waitlist_position = pp.waitlist_position - 10000,
         updated_at        = now()
   WHERE pp.plan_id = p_plan_id
     AND pp.assigned_group = 'WAITLIST'::assigned_group_enum
     AND pp.waitlist_position > 10000;

  -- Stage 3: Clean up any non-waitlist participants so their waitlist_position is strictly NULL
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (assigned_group IS DISTINCT FROM 'WAITLIST'::assigned_group_enum OR rsvp_status = 'SKIPPED'::rsvp_status)
     AND waitlist_position IS NOT NULL;

  RETURN v_promoted_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO service_role;

-- ============================================================================
-- 2. REMOVE_PARTICIPANT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_plan_size              INT;
  v_promoted_count         INT := 0;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  -- Safely lock plan record to coordinate concurrent changes
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status, assigned_group, COALESCE(leave_requested, FALSE)
    INTO v_target_role, v_target_status, v_target_assigned_group, v_target_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot remove the last active host
  IF v_target_role = 'HOST'::participant_role AND v_target_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Host-initiated removal always sets canonical skip_reason 'REMOVED'
  v_skip_reason := 'REMOVED'::skip_reason;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant:
  -- Update removed participant to SKIPPED with skip_reason = 'REMOVED'.
  -- Clear their assigned group, waitlist position, and queue metadata.
  -- Do NOT delete their participant record.
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = v_skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         joined_queue_at    = NULL,
         role               = 'PARTICIPANT'::participant_role,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         responded_at       = now(),
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- If this was a leave request, resolve the pending activity if present
  IF v_target_leave_requested = TRUE THEN
    UPDATE public.plan_activity
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"RESOLVED"')
     WHERE plan_id = p_plan_id
       AND target_user_id = p_target_user_id
       AND activity_type = 'participant_left'::plan_activity_type
       AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING');
  END IF;

  -- Ensure invited_participants count on plans is accurate (excludes SKIPPED)
  UPDATE public.plans
     SET invited_participants = (
       SELECT COUNT(*)
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND rsvp_status != 'SKIPPED'::rsvp_status
     ),
     updated_at = now()
   WHERE id = p_plan_id;

  -- Trigger appropriate waitlist promotion path
  IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    IF v_plan_size IS NOT NULL AND v_target_status = 'JOINED'::rsvp_status THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
    IF v_target_assigned_group IS NOT NULL THEN
      v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'skip_reason',      v_skip_reason,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$$;

ALTER FUNCTION public.remove_participant(uuid, uuid) OWNER TO postgres;

GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO anon;
GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO authenticated;
GRANT ALL ON FUNCTION public.remove_participant(uuid, uuid) TO service_role;
