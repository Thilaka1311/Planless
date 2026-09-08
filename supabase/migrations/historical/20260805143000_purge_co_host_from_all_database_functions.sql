-- Migration: Purge all stale references to CO_HOST from RPC functions and policies
-- Description: Updates promote_to_host, demote_from_host, cancel_plan, remove_participant,
--              update_plan_capacity, and related RPC functions to use ONLY 'HOST'::participant_role.

-- 1. promote_to_host RPC
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

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.promote_to_host(UUID, UUID) TO authenticated;

-- 2. demote_from_host RPC
CREATE OR REPLACE FUNCTION public.demote_from_host(
  p_plan_id        UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id     UUID;
  v_creator_id    UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_is_host       BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role = 'HOST'::participant_role THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may demote hosts' USING ERRCODE = '40300';
  END IF;

  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_role <> 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Target user is not currently a host' USING ERRCODE = '40900';
  END IF;

  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'demoted_user_id',  p_target_user_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.demote_from_host(UUID, UUID) TO authenticated;

-- 3. cancel_plan RPC
CREATE OR REPLACE FUNCTION public.cancel_plan(
  p_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       UUID;
  v_creator_id    UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_is_host       BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_user_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_user_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role = 'HOST'::participant_role THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may cancel the plan' USING ERRCODE = '40300';
  END IF;

  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_plan(UUID) TO authenticated;

-- 4. remove_participant RPC
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
  v_caller_id     UUID;
  v_creator_id    UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_is_host       BOOLEAN := FALSE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role = 'HOST'::participant_role THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may remove participants' USING ERRCODE = '40300';
  END IF;

  UPDATE public.plan_participants
     SET role           = 'PARTICIPANT'::participant_role,
         rsvp_status    = 'SKIPPED'::rsvp_status,
         skip_reason    = 'REMOVED'::skip_reason,
         assigned_group = NULL,
         responded_at   = now(),
         updated_at     = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'removed_user_id', p_target_user_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;
