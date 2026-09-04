-- Migration: Add leave_requested state to plan_participants & create request_paid_plan_leave RPC (Phase 1)
-- Description: Adds leave_requested & leave_requested_at columns to public.plan_participants.
--              Creates Security Definer RPC public.request_paid_plan_leave to record leave requests for paid plans.

-- 1. ADD COLUMNS TO plan_participants
ALTER TABLE public.plan_participants
  ADD COLUMN IF NOT EXISTS leave_requested BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leave_requested_at TIMESTAMPTZ;

-- 2. CREATE FUNCTION request_paid_plan_leave
CREATE OR REPLACE FUNCTION public.request_paid_plan_leave(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id            UUID;
  v_total_cost         NUMERIC;
  v_current_rsvp       rsvp_status;
  v_leave_requested    BOOLEAN;
  v_host_id            UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, total_cost
    INTO v_host_id, v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Verify plan is a paid plan
  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    RAISE EXCEPTION 'This feature is only for paid plans' USING ERRCODE = '40000';
  END IF;

  -- Creator/Host cannot use participant leave request
  IF v_user_id = v_host_id THEN
    RAISE EXCEPTION 'Host cannot submit a leave request' USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status, leave_requested
    INTO v_current_rsvp, v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp != 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'User is not currently JOINED in this plan' USING ERRCODE = '40000';
  END IF;

  IF v_leave_requested IS TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_requested', true
    );
  END IF;

  -- Update participant record to set leave_requested = true without changing rsvp_status
  UPDATE public.plan_participants
     SET leave_requested    = TRUE,
         leave_requested_at = now(),
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', true,
    'leave_requested_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_paid_plan_leave(UUID) TO authenticated;
