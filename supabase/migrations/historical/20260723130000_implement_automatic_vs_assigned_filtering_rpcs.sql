-- ============================================================================
-- Migration: Implement AUTOMATIC vs ASSIGNED participant filtering in DB
-- Description: Updates leave_plan RPC to strictly follow plans.participant_filtering rules.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id                  UUID;
  v_creator_id               UUID;
  v_max_participants         INT;
  v_total_cost               NUMERIC;
  v_current_rsvp             rsvp_status;
  v_joined_count             INT := 0;
  v_available_spots          INT := 0;
  v_waitlist_rec             RECORD;
  v_promoted_user_id         UUID := NULL;
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_rsvp_deadline            TIMESTAMPTZ;
BEGIN
  -- 1. Identify authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch the plan and its attributes
  SELECT host_id, max_participants, total_cost, participant_filtering, rsvp_deadline
    INTO v_creator_id, v_max_participants, v_total_cost, v_filtering_mode, v_rsvp_deadline
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Creator Host cannot leave their own plan
  IF v_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Creator host cannot leave the plan' USING ERRCODE = '40300';
  END IF;

  -- 4. Check user's current RSVP status
  SELECT rsvp_status
    INTO v_current_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- 5. Mark participant as SKIPPED with skip_reason = LEFT and reset role to PARTICIPANT
  UPDATE public.plan_participants
     SET role        = 'PARTICIPANT'::participant_role,
         rsvp_status = 'SKIPPED'::rsvp_status,
         skip_reason = 'LEFT'::skip_reason,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 6. Vacancy handling based on participant_filtering mode
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    v_available_spots := v_max_participants - v_joined_count;

    -- AUTOMATIC mode OR ASSIGNED mode past RSVP deadline: automatically promote Waitlist #1
    IF (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type OR (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_rsvp_deadline IS NOT NULL AND now() > v_rsvp_deadline)) THEN
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
                 updated_at   = now()
            WHERE plan_id = p_plan_id AND user_id = v_waitlist_rec.user_id;

          v_promoted_user_id := v_waitlist_rec.user_id;
          v_promoted_count := v_promoted_count + 1;
        END LOOP;
      END IF;
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
             updated_at           = now()
        WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   v_promoted_user_id,
    'promoted_count',     v_promoted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_plan(UUID) TO authenticated;
