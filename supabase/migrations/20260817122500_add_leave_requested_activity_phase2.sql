-- Migration: Phase 2 — Add leave_requested enum to plan_activity_type & update request_paid_plan_leave RPC
-- Description: Adds 'leave_requested' value to public.plan_activity_type ENUM.
--              Updates public.request_paid_plan_leave RPC to log leave_requested activity.
--              Updates RLS policy for public.plan_activity to restrict leave_requested activity entries strictly to host.

-- 1. ADD ENUM VALUE 'leave_requested' IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'leave_requested'
      AND enumtypid = 'public.plan_activity_type'::regtype
  ) THEN
    ALTER TYPE public.plan_activity_type ADD VALUE 'leave_requested';
  END IF;
END $$;

-- 2. UPDATE RPC request_paid_plan_leave TO INSERT ATOMICALLY INTO plan_activity
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

  -- Insert atomic plan_activity entry for leave_requested
  INSERT INTO public.plan_activity (
    plan_id,
    actor_id,
    target_user_id,
    activity_type,
    metadata
  ) VALUES (
    p_plan_id,
    v_user_id,
    v_user_id,
    'leave_requested'::plan_activity_type,
    jsonb_build_object('status', 'PENDING')
  );

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

-- 3. UPDATE RLS POLICY ON plan_activity FOR HOST-ONLY VISIBILITY OF leave_requested
DROP POLICY IF EXISTS "Allow plan participants to select plan_activity" ON public.plan_activity;

CREATE POLICY "Allow plan participants to select plan_activity"
ON public.plan_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_activity.plan_id
      AND plan_participants.user_id = auth.uid()
  )
  AND (
    activity_type != 'leave_requested'::plan_activity_type
    OR EXISTS (
      SELECT 1 FROM public.plans
      WHERE plans.id = plan_activity.plan_id
        AND plans.host_id = auth.uid()
    )
  )
);
