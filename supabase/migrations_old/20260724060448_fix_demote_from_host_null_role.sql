-- ============================================================================
-- Migration: Fix demote_from_host RPC caller host validation
-- Description: Ensures demote_from_host cleanly checks caller's host status
--              via plans.host_id OR plan_participants role/rsvp_status.
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
  v_caller_id      UUID;
  v_creator_id     UUID;
  v_caller_role    participant_role;
  v_caller_status  rsvp_status;
  v_is_host        BOOLEAN := FALSE;
  v_target_role    participant_role;
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

  -- 3. Authorization check: Caller must be the creator host OR a joined Host
  IF v_caller_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may demote hosts' USING ERRCODE = '40300';
  END IF;

  -- 4. Fetch target's current role
  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  -- 5. Target must currently be a host
  IF v_target_role NOT IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    RAISE EXCEPTION 'Target user is not currently a host' USING ERRCODE = '40900';
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
