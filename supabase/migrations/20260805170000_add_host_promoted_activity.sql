-- Migration: 20260805170000_add_host_promoted_activity.sql
-- Description: Add host_promoted to plan_activity_type ENUM and update promote_to_host RPC to log host_promoted activity.

-- 1. Add 'host_promoted' value to public.plan_activity_type ENUM
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'host_promoted' 
      AND enumtypid = 'public.plan_activity_type'::regtype
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'host_promoted';
  END IF;
END $$;

-- 2. Update promote_to_host RPC to log host_promoted activity
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
  v_creator_id            UUID;
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
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Authorization: Caller must be the current plans.host_id OR have role = 'HOST' in plan_participants
  IF v_caller_id <> v_creator_id THEN
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

  -- 5. Target is ALREADY a host -> silently return success
  IF v_target_role = 'HOST'::participant_role THEN
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

  -- 7. Promote target to HOST role in plan_participants
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

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
    'success',          true,
    'plan_id',          p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_to_host(UUID, UUID) TO authenticated;
