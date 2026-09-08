-- ============================================================================
-- Migration: Create promote_to_host and demote_from_host SECURITY DEFINER RPCs
-- Description: Handles host promotion and demotion atomically as trusted
--              operations. Only the creator host (plans.host_id) may execute
--              these functions. Changes only plan_participants.role;
--              plans.host_id is never modified.
-- ============================================================================

-- ─── promote_to_host ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.promote_to_host(
  p_plan_id      UUID,
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
  v_target_role    participant_role;
  v_target_status  rsvp_status;
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

  -- 3. Caller must be the creator host
  IF v_caller_id <> v_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the creator host may promote participants'
      USING ERRCODE = '40300';
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

  -- 5. Target must be in the Going (JOINED) state
  --    This mirrors what the application considers the Going bucket.
  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only Going participants can be promoted to host'
      USING ERRCODE = '40900';
  END IF;

  -- 6. Target must not already be a host
  IF v_target_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    RAISE EXCEPTION 'Target user is already a host'
      USING ERRCODE = '40900';
  END IF;

  -- 7. Promote: update role only, preserve all other state
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


-- ─── demote_from_host ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.demote_from_host(
  p_plan_id      UUID,
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

  -- 3. Caller must be the creator host
  IF v_caller_id <> v_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the creator host may demote hosts'
      USING ERRCODE = '40300';
  END IF;

  -- 4. Creator host can never be demoted
  IF p_target_user_id = v_creator_id THEN
    RAISE EXCEPTION 'The creator host cannot be demoted'
      USING ERRCODE = '40900';
  END IF;

  -- 5. Fetch target's current role
  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan'
      USING ERRCODE = '40400';
  END IF;

  -- 6. Target must currently be a host
  IF v_target_role NOT IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    RAISE EXCEPTION 'Target user is not currently a host'
      USING ERRCODE = '40900';
  END IF;

  -- 7. Demote: update role only, preserve rsvp_status and all other state
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
