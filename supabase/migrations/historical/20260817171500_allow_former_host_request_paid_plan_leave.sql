-- Migration: Allow former host to request paid plan leave after host transfer
-- Description: Updates public.request_paid_plan_leave to compare auth.uid() strictly against current plans.host_id.

CREATE OR REPLACE FUNCTION public.request_paid_plan_leave(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID;
  v_total_cost         NUMERIC;
  v_current_rsvp       rsvp_status;
  v_leave_requested    BOOLEAN;
  v_host_id            UUID;
  v_activity_id        UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, total_cost
    INTO v_host_id, v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Verify plan is a paid plan
  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    RAISE EXCEPTION 'This feature is only for paid plans' USING ERRCODE = '40000';
  END IF;

  -- CURRENT Host cannot submit a participant leave request.
  -- Former hosts who transferred host ownership (v_user_id != v_host_id) CAN submit leave requests.
  IF v_user_id = v_host_id THEN
    RAISE EXCEPTION 'Host cannot submit a leave request' USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status, leave_requested
    INTO v_current_rsvp, v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp != 'JOINED' THEN
    RAISE EXCEPTION 'Only joined participants can request to leave' USING ERRCODE = '40000';
  END IF;

  IF v_leave_requested IS TRUE THEN
    RAISE EXCEPTION 'Leave request is already pending' USING ERRCODE = '40000';
  END IF;

  -- Update participant record
  UPDATE public.plan_participants
     SET leave_requested = TRUE,
         leave_requested_at = now(),
         updated_at = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- Insert atomic plan activity row
  INSERT INTO public.plan_activity (
    plan_id, actor_id, target_user_id, activity_type, metadata
  ) VALUES (
    p_plan_id,
    v_user_id,
    v_user_id,
    'leave_requested'::plan_activity_type,
    jsonb_build_object('status', 'PENDING', 'requested_at', now())
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', true,
    'activity_id', v_activity_id
  );
END;
$$;
