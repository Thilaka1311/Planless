-- Migration: 20261010140000_fix_host_leave_with_replacement_paid_plan.sql
-- Description:
--   1. Fixes host-leaving flow so that the current host can leave any plan (free or paid)
--      normally upon confirming host transfer, without creating a leave request.
--   2. In request_host_leave_with_replacement:
--      - Atomically promotes the replacement candidate to HOST.
--      - Executes public.leave_plan(p_plan_id) for the caller, demoting caller to PARTICIPANT,
--        marking them SKIPPED/LEFT, clearing waitlist and assigned group.
--      - Triggers existing waitlist promotion logic (Automatic and Assigned) for the vacated spot.
--      - Ensures plans.invited_participants count is accurately synchronized.
--   3. In leave_plan:
--      - Explicitly resets leave_requested = FALSE and leave_requested_at = NULL.
--      - Falls back to COALESCE(v_vacated_group, 'GOING') for Assigned plans so host departure
--        always promotes eligible waitlisted participants to GOING.
--      - Synchronizes plans.invited_participants count.

-- ============================================================================
-- 1. LEAVE_PLAN
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
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_remaining_hosts          INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT plan_size, total_cost, participant_filtering
    INTO v_plan_size, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

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

  UPDATE public.plan_participants
     SET role               = 'PARTICIPANT'::participant_role,
         rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'LEFT'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         responded_at       = now(),
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- Synchronize plans.invited_participants (excludes SKIPPED)
  UPDATE public.plans
     SET invited_participants = (
       SELECT COUNT(*)
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND rsvp_status != 'SKIPPED'::rsvp_status
     ),
     updated_at = now()
   WHERE id = p_plan_id;

  -- Trigger canonical waitlist promotion logic
  IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_assigned(
        p_plan_id,
        COALESCE(v_vacated_group, 'GOING'::assigned_group_enum)
      );
    END IF;
  END IF;

  -- Recalculate cost per participant if paid plan
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
    ELSE
      v_new_cost_per_participant := NULL;
    END IF;

    UPDATE public.plan_participants
       SET cost_per_participant = v_new_cost_per_participant,
           updated_at           = now()
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   NULL,
    'promoted_count',     v_promoted_count
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_plan(uuid) TO service_role;

-- ============================================================================
-- 2. REQUEST_HOST_LEAVE_WITH_REPLACEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.request_host_leave_with_replacement(
  p_plan_id uuid,
  p_replacement_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id          UUID;
  v_caller_role        participant_role;
  v_caller_rsvp        rsvp_status;
  v_target_role        participant_role;
  v_target_rsvp        rsvp_status;
  v_total_cost         NUMERIC;
  v_leave_result       JSONB;
BEGIN
  -- 1. Verify authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists
  SELECT total_cost INTO v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Verify caller is an active HOST
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id
     FOR UPDATE;

  IF NOT FOUND OR v_caller_role <> 'HOST'::participant_role OR v_caller_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only active hosts can perform host replacement leave' USING ERRCODE = '40300';
  END IF;

  -- 4. Verify replacement user
  IF p_replacement_user_id IS NULL OR p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'A valid different replacement user must be specified' USING ERRCODE = '40000';
  END IF;

  SELECT role, rsvp_status
    INTO v_target_role, v_target_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement user is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  -- Strictly enforce: ONLY currently JOINED participants can become hosts
  IF v_target_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 5. Atomically promote replacement participant to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id = p_replacement_user_id;

  -- 6. Atomically execute leave for caller without creating a leave request (free or paid)
  v_leave_result := public.leave_plan(p_plan_id);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'promoted_user_id', p_replacement_user_id,
    'leave_requested',  false,
    'is_paid_plan',     (v_total_cost IS NOT NULL AND v_total_cost > 0),
    'leave_details',    v_leave_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_host_leave_with_replacement(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.request_host_leave_with_replacement(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_host_leave_with_replacement(uuid, uuid) TO service_role;
