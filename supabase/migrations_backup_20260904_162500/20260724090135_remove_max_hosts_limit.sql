-- ============================================================================
-- Migration: Remove Max Hosts Limit in promote_to_host RPC
-- Description: Removes artificial limits on maximum host count in promote_to_host RPC,
--              allowing any number of participants to be promoted to HOST.
-- ============================================================================

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

  -- 2. Fetch the creator host from plans
  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Authorization: Caller must be the creator host or an additional host
  IF v_caller_id <> v_creator_id THEN
    SELECT role INTO v_caller_role FROM public.plan_participants WHERE plan_id = p_plan_id AND user_id = v_caller_id;
    IF v_caller_role NOT IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
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
  IF v_target_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
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

  -- 7. Promote: update role only, preserve all other state (No max host count restriction)
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
