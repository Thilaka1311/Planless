-- Migration: 20260829150000_implement_assigned_waitlist_promotion.sql
-- Description: Creates dedicated public.auto_promote_waitlist_for_assigned helper and integrates it into leave_plan, remove_participant, and resolve_paid_plan_leave_request.

-- 1. Create dedicated Assigned Waitlist promotion & sliding function
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_assigned(
  p_plan_id UUID,
  p_vacated_group assigned_group_enum
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_filtering_mode   participant_filtering_type;
  v_max_participants INT;
  v_current_going    INT;
  v_promoted_user_id UUID;
  v_promoted_count   INT := 0;
BEGIN
  -- 1. Verify plan exists and is ASSIGNED
  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING, attempt promotion of WAITLIST #1
  IF p_vacated_group = 'GOING'::assigned_group_enum THEN
    IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;
         
      IF v_current_going < v_max_participants THEN
        -- Find WAITLIST #1 strictly by waitlist_position
        SELECT user_id INTO v_promoted_user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum
           AND rsvp_status = 'WAITLISTED'::rsvp_status
         ORDER BY waitlist_position ASC NULLS LAST, created_at ASC
         LIMIT 1
         FOR UPDATE;

        IF v_promoted_user_id IS NOT NULL THEN
          -- Atomically promote WAITLIST #1 to GOING and JOINED
          UPDATE public.plan_participants
             SET rsvp_status       = 'JOINED'::rsvp_status,
                 assigned_group    = 'GOING'::assigned_group_enum,
                 waitlist_position = NULL,
                 updated_at        = now()
           WHERE plan_id = p_plan_id AND user_id = v_promoted_user_id;
           
          v_promoted_count := 1;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
  WITH numbered AS (
    SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
      FROM public.plan_participants
     WHERE plan_id = p_plan_id 
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'WAITLISTED'::rsvp_status
  )
  UPDATE public.plan_participants pp
     SET waitlist_position = n.new_pos,
         updated_at        = CASE WHEN pp.waitlist_position IS DISTINCT FROM n.new_pos THEN now() ELSE pp.updated_at END
    FROM numbered n
   WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

  RETURN v_promoted_count;
END;
$$;

-- Grant permissions for auto_promote_waitlist_for_assigned
GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(UUID, assigned_group_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(UUID, assigned_group_enum) TO service_role;


-- 2. Update leave_plan RPC
CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id                  UUID;
  v_creator_id               UUID;
  v_max_participants         INT;
  v_total_cost               NUMERIC;
  v_current_rsvp             rsvp_status;
  v_vacated_group            assigned_group_enum;
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, max_participants, total_cost, participant_filtering
    INTO v_creator_id, v_max_participants, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Creator host cannot leave the plan' USING ERRCODE = '40300';
  END IF;

  -- Capture vacated group BEFORE state transition
  SELECT rsvp_status, assigned_group
    INTO v_current_rsvp, v_vacated_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- Transition leaving participant
  UPDATE public.plan_participants
     SET role              = 'PARTICIPANT'::participant_role,
         rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'LEFT'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_vacated_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_vacated_group);
      END IF;
    END IF;
  END IF;

  -- Recalculate cost shares if applicable
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
    ELSE
      v_new_cost_per_participant := NULL;
    END IF;

    UPDATE public.plan_participants
       SET cost_per_participant = v_new_cost_per_participant,
           updated_at           = now()
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   NULL,
    'promoted_count',     v_promoted_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.leave_plan(UUID) TO authenticated;


-- 3. Update remove_participant RPC
CREATE OR REPLACE FUNCTION public.remove_participant(
  p_plan_id        UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id             UUID;
  v_creator_id            UUID;
  v_caller_role           participant_role;
  v_target_status         rsvp_status;
  v_target_assigned_group assigned_group_enum;
  v_filtering_mode        participant_filtering_type;
  v_max_participants      INT;
  v_promoted_count        INT := 0;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, participant_filtering, max_participants
    INTO v_creator_id, v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_id = v_creator_id OR v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  IF p_target_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot remove the creator host' USING ERRCODE = '40300';
  END IF;

  -- Capture target participant's existing assigned_group BEFORE state update
  SELECT rsvp_status, assigned_group 
    INTO v_target_status, v_target_assigned_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant
  UPDATE public.plan_participants
     SET rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'REMOVED'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         role              = 'PARTICIPANT'::participant_role,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      IF v_target_status = 'JOINED'::rsvp_status THEN
        v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
      END IF;
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;


-- 4. Update resolve_paid_plan_leave_request RPC
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
  v_caller_id                  UUID;
  v_host_id                    UUID;
  v_filtering_mode             participant_filtering_type;
  v_max_participants           INT;
  v_target_rsvp                rsvp_status;
  v_target_leave_req           BOOLEAN;
  v_target_assigned_group      assigned_group_enum;
  v_activity_id                UUID;
  v_expense_id                 UUID;
  v_replacement_rsvp           rsvp_status;
  v_replacement_assigned_group assigned_group_enum;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Lock & fetch plan details
  SELECT host_id, COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type), max_participants
    INTO v_host_id, v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
  END IF;

  IF p_resolution NOT IN ('REPLACED', 'KEEP_PAYMENT') THEN
    RAISE EXCEPTION 'Invalid resolution type. Must be REPLACED or KEEP_PAYMENT' USING ERRCODE = '40000';
  END IF;

  -- 2. Lock & fetch target participant details (capturing assigned_group BEFORE update)
  SELECT rsvp_status, leave_requested, assigned_group
    INTO v_target_rsvp, v_target_leave_req, v_target_assigned_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  -- Find corresponding pending activity row
  SELECT id INTO v_activity_id
    FROM public.plan_activity
   WHERE plan_id = p_plan_id
     AND target_user_id = p_target_user_id
     AND activity_type = 'leave_requested'::plan_activity_type
     AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING')
   ORDER BY created_at DESC
   LIMIT 1;

  -- 3. FIRST, transition outgoing target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'REPLACED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    -- Clear unsettled wallet obligation
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
    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'PAYMENT_KEPT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
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

    -- Trigger waitlist promotion for KEEP_PAYMENT
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    ELSIF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      PERFORM public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  -- 4. SECOND, handle replacement participant if REPLACED
  IF p_replacement_user_id IS NOT NULL AND p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status, assigned_group INTO v_replacement_rsvp, v_replacement_assigned_group
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF FOUND AND (v_replacement_assigned_group = 'GOING'::assigned_group_enum OR (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_rsvp = 'JOINED'::rsvp_status)) THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      -- Insert new replacement user directly with target user's former assigned_group
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END, NULL
      );
    ELSE
      IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        -- Assigned Waitlist Replacement Logic: Replacement takes target's old assigned group
        UPDATE public.plan_participants
           SET assigned_group     = v_target_assigned_group,
               rsvp_status        = CASE 
                                      WHEN rsvp_status = 'WAITLISTED'::rsvp_status AND v_target_assigned_group = 'GOING'::assigned_group_enum THEN 'JOINED'::rsvp_status 
                                      ELSE rsvp_status 
                                    END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        -- Since replacement user left the waitlist, renumber the remaining waitlist contiguously
        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);
      ELSE
        -- Standard replacement logic (external user or non-waitlisted user)
        UPDATE public.plan_participants
           SET rsvp_status        = 'INVITED'::rsvp_status,
               assigned_group     = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'resolution',          p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_paid_plan_leave_request(UUID, UUID, TEXT, UUID) TO authenticated;
