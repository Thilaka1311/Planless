-- Migration: Remove automatic displacement/promotion from update_plan_capacity for ASSIGNED mode
-- Description: In Assigned Mode, capacity adjustments require host explicit selection via guided bottom sheet.
--              Automatic mode capacity increases continue using auto_promote_waitlist_for_automatic.

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id UUID,
  p_max_participants INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID;
  v_creator_id     UUID;
  v_caller_role    participant_role;
  v_filtering      TEXT;
  v_promoted_count INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_creator_id, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_user_id = v_creator_id OR v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    -- Automatic mode capacity increase: promote top waitlisted participants if spots available
    SELECT COUNT(*) INTO v_promoted_count
      FROM public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  -- Log capacity_changed business event
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
  VALUES (
    p_plan_id,
    v_user_id,
    NULL,
    'capacity_changed'::plan_activity_type,
    jsonb_build_object('new_capacity', p_max_participants, 'promoted_count', v_promoted_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_capacity', p_max_participants,
    'promoted_count', v_promoted_count
  );
END;
$$;
