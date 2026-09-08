-- ============================================================================
-- Migration: Create cancel_plan SECURITY DEFINER RPC function
-- Description: Allows ONLY the Creator Host (plans.host_id) to update plan status
--              from LIVE to CANCELLED. Additional hosts or regular participants are rejected.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_plan(
  p_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id    UUID;
  v_creator_id UUID;
BEGIN
  -- 1. Identify authenticated user from JWT context
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

  -- 3. Authorization check: ONLY the Creator Host (plans.host_id) may cancel
  IF v_user_id <> v_creator_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the creator host may cancel the plan'
      USING ERRCODE = '40300';
  END IF;

  -- 4. Perform update: status -> CANCELLED
  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  -- 5. Return structured JSON response
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_plan(UUID) TO authenticated;
