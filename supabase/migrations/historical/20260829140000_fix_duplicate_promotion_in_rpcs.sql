-- Migration: Fix Duplicate Waitlist Promotion in RPCs
-- Description: Removes redundant waitlist promotion loops from leave_plan and remove_participant,
--              replacing them with a single call to public.auto_promote_waitlist_for_automatic().

-- 1. Update leave_plan RPC
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
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_rsvp_deadline            TIMESTAMPTZ;
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

  IF v_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Creator host cannot leave the plan' USING ERRCODE = '40300';
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

  UPDATE public.plan_participants
     SET role           = 'PARTICIPANT'::participant_role,
         rsvp_status    = 'SKIPPED'::rsvp_status,
         skip_reason    = 'LEFT'::skip_reason,
         assigned_group = NULL,
         responded_at   = now(),
         updated_at     = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    IF (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type OR (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_rsvp_deadline IS NOT NULL AND now() > v_rsvp_deadline)) THEN
      -- Delegate exclusively to the core waitlist promotion function
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

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
$$;


-- 2. Update remove_participant RPC
CREATE OR REPLACE FUNCTION public.remove_participant(
  p_plan_id        UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id        UUID;
  v_creator_id       UUID;
  v_caller_role      participant_role;
  v_target_status    rsvp_status;
  v_filtering_mode   participant_filtering_type;
  v_max_participants INT;
  v_promoted_count   INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, participant_filtering, max_participants
    INTO v_creator_id, v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  IF p_target_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot remove the creator host' USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.plan_participants
     SET rsvp_status    = 'SKIPPED'::rsvp_status,
         skip_reason    = 'REMOVED'::skip_reason,
         assigned_group = NULL,
         role           = 'PARTICIPANT'::participant_role,
         responded_at   = now(),
         updated_at     = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF v_target_status = 'JOINED'::rsvp_status AND v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    IF v_max_participants IS NOT NULL THEN
      -- Delegate exclusively to the core waitlist promotion function
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id,
    'promoted_user_id', NULL,
    'promoted_count', v_promoted_count
  );
END;
$$;


-- 3. Safety Cleanup: Fix any waitlist position corruption left by the legacy loops
UPDATE public.plan_participants
   SET waitlist_position = NULL
 WHERE assigned_group IS NULL 
   AND rsvp_status != 'WAITLISTED'::rsvp_status
   AND waitlist_position IS NOT NULL;
