-- Migration: Add cancel_paid_plan_leave_request RPC
-- Description: Cancels a pending leave request for a paid plan by setting leave_requested = FALSE and leave_requested_at = NULL.

CREATE OR REPLACE FUNCTION public.cancel_paid_plan_leave_request(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID;
  v_leave_requested    BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT leave_requested
    INTO v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_leave_requested IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_cancelled', true
    );
  END IF;

  -- Reset leave_requested state to false without touching rsvp_status, wallet, or anything else
  UPDATE public.plan_participants
     SET leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_paid_plan_leave_request(UUID) TO authenticated;
