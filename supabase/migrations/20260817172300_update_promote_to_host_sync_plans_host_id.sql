-- Migration: Update promote_to_host RPC to atomically update plans.host_id and demote previous host role to PARTICIPANT
-- Description: Ensures plans.host_id always reflects the newly promoted host, and demotes the former host's role in plan_participants to PARTICIPANT.

CREATE OR REPLACE FUNCTION public.promote_to_host(
  p_plan_id        UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id             UUID;
  v_current_host_id       UUID;
  v_caller_role           participant_role;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
BEGIN
  -- 1. Identify authenticated user
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch the current host_id owner from plans
  SELECT host_id
    INTO v_current_host_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Authorization: Caller must be the current plans.host_id OR have role = 'HOST' in plan_participants
  IF v_caller_id <> v_current_host_id THEN
    SELECT role INTO v_caller_role
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role THEN
      RAISE EXCEPTION 'Unauthorized: Only hosts may promote participants' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 4. Fetch target participant's current role and rsvp_status
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan'
      USING ERRCODE = '40400';
  END IF;

  -- 5. Target is ALREADY a host -> ensure plans.host_id is updated and return success
  IF v_target_role = 'HOST'::participant_role THEN
    UPDATE public.plans
       SET host_id = p_target_user_id,
           updated_at = now()
     WHERE id = p_plan_id;

    -- Demote old host role to PARTICIPANT if target is different from caller/old host
    IF v_current_host_id IS NOT NULL AND v_current_host_id <> p_target_user_id THEN
      UPDATE public.plan_participants
         SET role = 'PARTICIPANT'::participant_role,
             updated_at = now()
       WHERE plan_id = p_plan_id AND user_id = v_current_host_id;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_target_user_id,
      'already_host', true
    );
  END IF;

  -- 6. Target must be in the Going (JOINED) state
  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only Going participants can be promoted to host'
      USING ERRCODE = '40900';
  END IF;

  -- 7. Promote target to HOST role in plan_participants AND update plans.host_id
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  UPDATE public.plans
     SET host_id    = p_target_user_id,
         updated_at = now()
   WHERE id = p_plan_id;

  -- Demote old host role in plan_participants to PARTICIPANT if target is different
  IF v_current_host_id IS NOT NULL AND v_current_host_id <> p_target_user_id THEN
    UPDATE public.plan_participants
       SET role = 'PARTICIPANT'::participant_role,
           updated_at = now()
     WHERE plan_id = p_plan_id AND user_id = v_current_host_id;
  END IF;

  -- 8. Log host_promoted activity in public.plan_activity
  INSERT INTO public.plan_activity (
    plan_id,
    actor_id,
    target_user_id,
    activity_type,
    metadata
  ) VALUES (
    p_plan_id,
    v_caller_id,
    p_target_user_id,
    'host_promoted'::plan_activity_type,
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$$;
