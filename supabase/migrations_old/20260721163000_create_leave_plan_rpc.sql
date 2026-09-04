-- ============================================================================
-- Migration: Create leave_plan SECURITY DEFINER RPC function
-- Description: Handles participant departure, waitlist promotion, and cost allocation
--              atomically as a system-owned operation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_host_id UUID;
  v_max_participants INT;
  v_total_cost NUMERIC;
  v_current_rsvp rsvp_status;
  v_joined_count INT;
  v_available_spots INT;
  v_waitlist_rec RECORD;
  v_promoted_user_id UUID := NULL;
  v_promoted_count INT := 0;
  v_active_count INT;
  v_new_cost_per_participant NUMERIC := NULL;
BEGIN
  -- 1. Identify authenticated user from JWT context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch plan details
  SELECT host_id, max_participants, total_cost
    INTO v_host_id, v_max_participants, v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Security Check: Host cannot leave their own plan
  IF v_host_id = v_user_id THEN
    RAISE EXCEPTION 'Host cannot leave their own plan' USING ERRCODE = '40300';
  END IF;

  -- 4. Check that authenticated user is a participant in this plan
  SELECT rsvp_status
    INTO v_current_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40401';
  END IF;

  IF v_current_rsvp = 'SKIPPED' THEN
    -- User has already left or skipped
    RETURN jsonb_build_object(
      'success', true,
      'already_left', true,
      'plan_id', p_plan_id,
      'leaving_user_id', v_user_id
    );
  END IF;

  -- 5. Mark participant as SKIPPED with skip_reason = LEFT
  UPDATE public.plan_participants
     SET rsvp_status = 'SKIPPED'::rsvp_status,
         skip_reason = 'LEFT'::skip_reason,
         responded_at = now(),
         updated_at = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 6. Automatic Waitlist Promotion
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    v_available_spots := v_max_participants - v_joined_count;

    IF v_available_spots > 0 THEN
      FOR v_waitlist_rec IN
        SELECT user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'
         ORDER BY created_at ASC
         LIMIT v_available_spots
      LOOP
        UPDATE public.plan_participants
           SET rsvp_status = 'JOINED'::rsvp_status,
               skip_reason = NULL,
               responded_at = now(),
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_waitlist_rec.user_id;

        v_promoted_user_id := v_waitlist_rec.user_id;
        v_promoted_count := v_promoted_count + 1;
      END LOOP;
    END IF;
  END IF;

  -- 7. Recalculate participant cost allocation if plan has total_cost > 0
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := ROUND(v_total_cost / v_active_count, 2);

      UPDATE public.plan_participants
         SET cost_per_participant = v_new_cost_per_participant,
             updated_at = now()
       WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
    END IF;
  END IF;

  -- 8. Return success payload
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'leaving_user_id', v_user_id,
    'promoted_count', v_promoted_count,
    'last_promoted_user_id', v_promoted_user_id
  );
END;
$$;

-- Security & Permissions
REVOKE EXECUTE ON FUNCTION public.leave_plan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_plan(UUID) TO authenticated;
