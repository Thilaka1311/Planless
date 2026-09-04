-- Migration: Assigned Waitlist Leave-Request Resolution
-- Description: Updates resolve_paid_plan_leave_request to properly handle waitlist promotion, capacity reduction, and replacement logic for assigned waitlists.

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
  v_waitlist_mode      TEXT;
  v_target_rsvp        rsvp_status;
  v_target_leave_req   BOOLEAN;
  v_activity_id        UUID;
  v_expense_id         UUID;
  v_eligible_waitlist_user_id UUID;
  v_replacement_rsvp   rsvp_status;
  v_replacement_assigned_group TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, waitlist_mode
    INTO v_host_id, v_waitlist_mode
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

  -- 1. FIRST, remove the outgoing target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
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

    -- CLEAR target participant's wallet obligation for plan expense ONLY IF UNSETTLED (PRESERVE IF SETTLED)
    SELECT id INTO v_expense_id
      FROM public.wallet_expenses
     WHERE plan_id = p_plan_id AND message_id IS NULL
     LIMIT 1;

    IF v_expense_id IS NOT NULL THEN
      DELETE FROM public.wallet_expense_participants
       WHERE expense_id = v_expense_id
         AND user_id = p_target_user_id
         AND status != 'SETTLED';
    END IF;

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
    -- Update target participant to SKIPPED / PAYMENT_KEPT without deleting wallet row
    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'PAYMENT_KEPT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'KEEP_PAYMENT',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;

    -- Handle ASSIGNED WAITLIST promotion or capacity reduction
    IF v_waitlist_mode = 'assigned' THEN
      SELECT user_id INTO v_eligible_waitlist_user_id
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'
         AND rsvp_status IN ('WAITLISTED', 'JOINED')
       ORDER BY waitlist_position ASC NULLS LAST, created_at ASC
       LIMIT 1;
       
      IF v_eligible_waitlist_user_id IS NOT NULL THEN
        -- Promote to JOINED assigned group
        UPDATE public.plan_participants
           SET assigned_group = 'JOINED',
               waitlist_position = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_eligible_waitlist_user_id;
         
        -- Renumber remaining waitlist contiguously
        WITH numbered AS (
          SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
            FROM public.plan_participants
           WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'
        )
        UPDATE public.plan_participants pp
           SET waitlist_position = n.new_pos,
               updated_at = now()
          FROM numbered n
         WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;
         
      ELSE
        -- No eligible waitlist participant found -> reduce max_participants by 1 to remove empty slot
        UPDATE public.plans
           SET max_participants = max_participants - 1,
               updated_at = now()
         WHERE id = p_plan_id AND max_participants > 0;
      END IF;
    END IF;
  END IF;

  -- 2. SECOND, handle the replacement user.
  IF p_replacement_user_id IS NOT NULL THEN
    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status, assigned_group INTO v_replacement_rsvp, v_replacement_assigned_group
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF FOUND AND v_replacement_assigned_group = 'JOINED' THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      -- If replacement user is not in plan_participants yet, add them directly as INVITED
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role, NULL, NULL
      );
    ELSE
      IF v_waitlist_mode = 'assigned' AND v_replacement_assigned_group = 'WAITLIST' THEN
        -- Assigned Waitlist Replacement Logic
        UPDATE public.plan_participants
           SET assigned_group = 'JOINED',
               rsvp_status = CASE 
                               WHEN rsvp_status = 'WAITLISTED' THEN 'JOINED'::rsvp_status 
                               ELSE rsvp_status 
                             END,
               waitlist_position = NULL,
               skip_reason = NULL,
               leave_requested = FALSE,
               leave_requested_at = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        -- Renumber waitlist
        WITH numbered AS (
          SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
            FROM public.plan_participants
           WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'
        )
        UPDATE public.plan_participants pp
           SET waitlist_position = n.new_pos,
               updated_at = now()
          FROM numbered n
         WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;
      ELSE
        -- Standard replacement logic (or automatic waitlist replacement)
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

GRANT EXECUTE ON FUNCTION public.resolve_paid_plan_leave_request(UUID, UUID, TEXT, UUID) TO authenticated;
