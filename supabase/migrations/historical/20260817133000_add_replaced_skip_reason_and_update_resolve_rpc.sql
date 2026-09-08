-- Migration: Add REPLACED value to public.skip_reason enum and update resolve_paid_plan_leave_request RPC
-- Description: Adds 'REPLACED' to skip_reason enum and updates public.resolve_paid_plan_leave_request to set target participant to SKIPPED/REPLACED and replacement participant to INVITED.

ALTER TYPE public.skip_reason ADD VALUE IF NOT EXISTS 'REPLACED';

CREATE OR REPLACE FUNCTION public.resolve_paid_plan_leave_request(
  p_plan_id UUID,
  p_target_user_id UUID,
  p_resolution TEXT, -- 'REPLACED' or 'KEEP_PAYMENT'
  p_replacement_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id          UUID;
  v_host_id            UUID;
  v_target_rsvp        rsvp_status;
  v_target_leave_req   BOOLEAN;
  v_replacement_rsvp   rsvp_status;
  v_activity_id        UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id
    INTO v_host_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
  END IF;

  IF p_resolution NOT IN ('REPLACED', 'KEEP_PAYMENT') THEN
    RAISE EXCEPTION 'Invalid resolution type. Must be REPLACED or KEEP_PAYMENT' USING ERRCODE = '40000';
  END IF;

  SELECT rsvp_status, leave_requested
    INTO v_target_rsvp, v_target_leave_req
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  -- Find the corresponding pending leave_requested activity row
  SELECT id INTO v_activity_id
    FROM public.plan_activity
   WHERE plan_id = p_plan_id
     AND target_user_id = p_target_user_id
     AND activity_type = 'leave_requested'::plan_activity_type
     AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING')
   ORDER BY created_at DESC
   LIMIT 1;

  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status INTO v_replacement_rsvp
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF v_replacement_rsvp = 'JOINED' THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      -- If replacement user is not in plan_participants yet, add them as INVITED
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role, NULL, NULL
      );
    ELSE
      -- Update replacement user to INVITED
      UPDATE public.plan_participants
         SET rsvp_status = 'INVITED'::rsvp_status,
             assigned_group = NULL,
             waitlist_position = NULL,
             skip_reason = NULL,
             leave_requested = FALSE,
             leave_requested_at = NULL,
             updated_at = now()
       WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
    END IF;

    -- Update target participant to SKIPPED / REPLACED
    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'REPLACED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    -- Update existing activity row metadata
    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'REPLACED',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;

  ELSIF p_resolution = 'KEEP_PAYMENT' THEN
    -- Update target participant to SKIPPED / LEFT without touching wallet
    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'LEFT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    -- Update existing activity row metadata
    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'KEEP_PAYMENT',
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'target_user_id', p_target_user_id,
    'resolution', p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;
