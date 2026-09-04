-- ============================================================================
-- Migration: Update demote_from_host SECURITY DEFINER RPC
-- Description: Allows any host (creator or co-host) to demote any host.
-- ============================================================================

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
  v_caller_id    UUID;
  v_creator_id   UUID;
  v_caller_role  participant_role;
  v_target_role  participant_role;
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

  -- 3. Authorization check: Caller must be the creator host OR have role IN ('HOST', 'CO_HOST')
  IF v_caller_id <> v_creator_id THEN
    SELECT role INTO v_caller_role FROM public.plan_participants WHERE plan_id = p_plan_id AND user_id = v_caller_id;
    IF v_caller_role NOT IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
      RAISE EXCEPTION 'Unauthorized: Only hosts may demote hosts'
        USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 4. Fetch target's current role
  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan'
      USING ERRCODE = '40400';
  END IF;

  -- 5. Target must currently be a host
  IF v_target_role NOT IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    RAISE EXCEPTION 'Target user is not currently a host'
      USING ERRCODE = '40900';
  END IF;

  -- 6. Demote: update role only, preserve rsvp_status and all other state
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
