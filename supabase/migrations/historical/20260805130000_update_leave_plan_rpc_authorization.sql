-- Migration: Fix leave_plan RPC to check if caller matches current plans.host_id rather than obsolete hardcoded check
-- Description: Updates public.leave_plan(p_plan_id) to check v_user_id = v_creator_id ONLY IF no other HOST exists in plan_participants.
--              If another HOST exists, any host (including original creator) is authorized to leave.

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
  v_other_hosts_count        INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, max_participants, total_cost, participant_filtering, rsvp_deadline
    INTO v_creator_id, v_max_participants, v_total_cost, v_filtering_mode, v_rsvp_deadline
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Count other active hosts in this plan
  SELECT COUNT(*)
    INTO v_other_hosts_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND user_id != v_user_id
     AND role = 'HOST'::participant_role
     AND rsvp_status = 'JOINED'::rsvp_status;

  -- Only block departure if caller is current host_id AND no other host exists
  IF v_user_id = v_creator_id AND v_other_hosts_count = 0 THEN
    RAISE EXCEPTION 'Creator host cannot leave the plan without promoting another host' USING ERRCODE = '40300';
  END IF;

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

  -- Update participant row: keep assigned_group unchanged
  UPDATE public.plan_participants
     SET role           = 'PARTICIPANT'::participant_role,
         rsvp_status    = 'SKIPPED'::rsvp_status,
         skip_reason    = 'LEFT'::skip_reason,
         responded_at   = now(),
         updated_at     = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    v_available_spots := v_max_participants - v_joined_count;

    IF (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type OR (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_rsvp_deadline IS NOT NULL AND now() > v_rsvp_deadline)) THEN
      IF v_available_spots > 0 THEN
        FOR v_waitlist_rec IN
          SELECT user_id
            FROM public.plan_participants
           WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'
           ORDER BY joined_queue_at ASC NULLS LAST, created_at ASC
           LIMIT v_available_spots
        LOOP
          UPDATE public.plan_participants
             SET rsvp_status   = 'JOINED'::rsvp_status,
                 responded_at  = now(),
                 updated_at    = now()
           WHERE plan_id = p_plan_id AND user_id = v_waitlist_rec.user_id;

          v_promoted_count := v_promoted_count + 1;
          IF v_promoted_user_id IS NULL THEN
            v_promoted_user_id := v_waitlist_rec.user_id;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status IN ('JOINED', 'WAITLISTED');

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
      UPDATE public.plans
         SET cost_per_person = v_new_cost_per_participant,
             updated_at      = now()
       WHERE id = p_plan_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          v_user_id,
    'promoted_count',   v_promoted_count,
    'promoted_user_id', v_promoted_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_plan(UUID) TO authenticated;
