-- ============================================================================
-- Migration: Create update_plan_capacity SECURITY DEFINER RPC function
-- Description: Updates max_participants on a plan. Authorized for Creator Host
--              (plans.host_id) or Additional Hosts (plan_participants.role IN ('HOST', 'CO_HOST')).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id          UUID,
  p_max_participants INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     UUID;
  v_creator_id  UUID;
  v_caller_role participant_role;
BEGIN
  -- 1. Identify authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch the plan and its creator host
  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Fetch caller's role in plan_participants
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 4. Authorization check: Creator Host OR Additional Host (role IN ('HOST', 'CO_HOST'))
  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL; -- Authorized
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  -- 5. Validate capacity (must be at least 2)
  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  -- 6. Perform update on plans table
  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- 7. Return JSON response
  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
