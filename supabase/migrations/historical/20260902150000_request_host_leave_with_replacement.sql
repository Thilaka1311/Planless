-- Migration: Host Leave With Replacement RPC
-- Description: Creates an atomic Security Definer RPC public.request_host_leave_with_replacement
-- that promotes a currently JOINED participant to HOST and atomically submits the original host's
-- leave request (for paid plans) or executes leave (for free plans), ensuring the plan is never hostless.

CREATE OR REPLACE FUNCTION public.request_host_leave_with_replacement(p_plan_id uuid, p_replacement_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_caller_role        participant_role;
  v_caller_rsvp        rsvp_status;
  v_target_role        participant_role;
  v_target_rsvp        rsvp_status;
  v_total_cost         NUMERIC;
  v_leave_result       JSONB;
  v_activity_id        UUID;
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

  -- 5. Promote replacement to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id = p_replacement_user_id;

  -- Log host promotion activity
  INSERT INTO public.plan_activity (
    plan_id, actor_id, target_user_id, activity_type, metadata
  ) VALUES (
    p_plan_id, v_caller_id, p_replacement_user_id, 'host_promoted'::plan_activity_type, '{}'::jsonb
  );

  -- 6. Process caller leave based on plan pricing
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    -- Paid Plan -> create pending leave request for caller
    UPDATE public.plan_participants
       SET leave_requested    = TRUE,
           leave_requested_at = now(),
           updated_at         = now()
     WHERE plan_id = p_plan_id
       AND user_id = v_caller_id;

    INSERT INTO public.plan_activity (
      plan_id, actor_id, target_user_id, activity_type, metadata
    ) VALUES (
      p_plan_id,
      v_caller_id,
      v_caller_id,
      'participant_left'::plan_activity_type,
      jsonb_build_object(
        'status', 'PENDING',
        'requested_at', now(),
        'promoted_host_id', p_replacement_user_id
      )
    )
    RETURNING id INTO v_activity_id;

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', true,
      'is_paid_plan', true,
      'activity_id', v_activity_id
    );
  ELSE
    -- Free Plan -> execute immediate leave for caller
    v_leave_result := public.leave_plan(p_plan_id);

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', false,
      'is_paid_plan', false,
      'leave_details', v_leave_result
    );
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.request_host_leave_with_replacement(UUID, UUID) TO authenticated;
