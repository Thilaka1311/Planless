-- Migration: 20260828114000_fix_replacement_invitation_logic.sql
-- Description: Correctly logs 'participant_invited' activity when inviting a non-waitlisted friend as a replacement, ensuring push notifications and invitation visibility. Properly handles waitlist promotion to 'JOINED' vs new friend invitation to 'INVITED'.

-- 1. UPDATE resolve_paid_plan_leave_request RPC
CREATE OR REPLACE FUNCTION public.resolve_paid_plan_leave_request(
  p_plan_id UUID,
  p_target_user_id UUID,
  p_resolution text,
  p_replacement_user_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id          UUID;
  v_host_id            UUID;
  v_filtering_mode     participant_filtering_type;
  v_max_participants   INT;
  v_target_rsvp        rsvp_status;
  v_target_leave_req   BOOLEAN;
  v_activity_id        UUID;
  v_expense_id         UUID;
  v_eligible_waitlist_user_id UUID;
  v_replacement_rsvp   rsvp_status;
  v_replacement_assigned_group assigned_group_enum;
BEGIN
  -- 1. Verify caller & plan authorization
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, participant_filtering, max_participants
    INTO v_host_id, v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
    ) THEN
      RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 2. Lock & fetch target participant details
  SELECT rsvp_status, leave_requested
    INTO v_target_rsvp, v_target_leave_req
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  -- Find the corresponding pending participant_left activity row
  SELECT id INTO v_activity_id
    FROM public.plan_activity
   WHERE plan_id = p_plan_id
     AND target_user_id = p_target_user_id
     AND activity_type = 'participant_left'::plan_activity_type
     AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING')
   ORDER BY created_at DESC
   LIMIT 1;

  -- 3. FIRST, remove/update the outgoing target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    -- Update target participant to SKIPPED / SKIPPED
    UPDATE public.plan_participants
       SET rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'SKIPPED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
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
         AND status != 'SETTLED'::wallet_expense_status;
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

    -- Handle ASSIGNED vs AUTOMATIC waitlist mode for KEEP_PAYMENT
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      -- Find position #1 on assigned waitlist ONLY if accepted (rsvp_status IN WAITLISTED, JOINED)
      SELECT user_id INTO v_eligible_waitlist_user_id
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND waitlist_position = 1
         AND rsvp_status IN ('WAITLISTED'::rsvp_status, 'JOINED'::rsvp_status)
       LIMIT 1;
       
      IF v_eligible_waitlist_user_id IS NOT NULL THEN
        -- Promote #1 to GOING assigned group and JOINED rsvp status
        UPDATE public.plan_participants
           SET assigned_group = 'GOING'::assigned_group_enum,
               rsvp_status = 'JOINED'::rsvp_status,
               waitlist_position = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_eligible_waitlist_user_id;
         
        -- Renumber remaining waitlist contiguously (#2 -> #1, #3 -> #2)
        WITH numbered AS (
          SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
            FROM public.plan_participants
           WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'::assigned_group_enum
        )
        UPDATE public.plan_participants pp
           SET waitlist_position = n.new_pos,
               updated_at = now()
          FROM numbered n
         WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;
         
      ELSE
        -- No eligible #1 waitlist participant found -> reduce max_participants by 1 to remove empty slot
        IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
          UPDATE public.plans
             SET max_participants = max_participants - 1,
                 updated_at = now()
           WHERE id = p_plan_id;
        END IF;
      END IF;

    ELSIF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      -- Trigger auto-promotion for automatic waitlist
      PERFORM public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  -- 4. SECOND, handle the replacement user if REPLACED
  IF p_replacement_user_id IS NOT NULL THEN
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
      -- Completely new friend -> insert them as INVITED
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END, NULL
      );

      -- Log business activity event for invitation
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (p_plan_id, v_caller_id, p_replacement_user_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);

    ELSE
      -- Existing participant (waitlisted, skipped, left, etc.)
      IF (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum) OR
         (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_rsvp IN ('WAITLISTED'::rsvp_status)) THEN
        
        -- Assigned/Automatic Waitlist Replacement Logic: promote to GOING and JOINED
        UPDATE public.plan_participants
           SET assigned_group = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
               rsvp_status = 'JOINED'::rsvp_status,
               waitlist_position = NULL,
               skip_reason = NULL,
               leave_requested = FALSE,
               leave_requested_at = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
          -- Renumber waitlist
          WITH numbered AS (
            SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
              FROM public.plan_participants
             WHERE plan_id = p_plan_id AND assigned_group = 'WAITLIST'::assigned_group_enum
          )
          UPDATE public.plan_participants pp
             SET waitlist_position = n.new_pos,
                 updated_at = now()
            FROM numbered n
           WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;
        END IF;

      ELSE
        -- Standard replacement logic for non-waitlist (e.g. SKIPPED, LEFT, REMOVED) -> invite them anew
        UPDATE public.plan_participants
           SET rsvp_status = 'INVITED'::rsvp_status,
               assigned_group = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
               waitlist_position = NULL,
               skip_reason = NULL,
               leave_requested = FALSE,
               leave_requested_at = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        -- Log business activity event for invitation if they were not already invited
        IF v_replacement_rsvp != 'INVITED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (p_plan_id, v_caller_id, p_replacement_user_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);
        END IF;
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

-- 2. UPDATE replace_participant RPC
CREATE OR REPLACE FUNCTION public.replace_participant(
  p_plan_id UUID,
  p_target_user_id UUID,
  p_replacement_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id          UUID;
  v_host_id            UUID;
  v_target_row         RECORD;
  v_replacement_row    RECORD;
  v_target_was_going   BOOLEAN := FALSE;
  v_replacement_prev_pos INT := NULL;
  v_filtering_mode     participant_filtering_type;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan & host authorization
  SELECT host_id, participant_filtering
    INTO v_host_id, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
    ) THEN
      RAISE EXCEPTION 'Only the plan host can replace participants' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 3. Lock target participant row
  SELECT assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  v_target_was_going := (v_target_row.assigned_group = 'GOING'::assigned_group_enum OR v_target_row.rsvp_status = 'JOINED'::rsvp_status);

  -- 4. Check if replacement participant is already in plan_participants
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
   FOR UPDATE;

  -- 5. Transition target participant to SKIPPED / SKIPPED
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'SKIPPED'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 6. Transition or Insert replacement participant
  IF FOUND THEN
    v_replacement_prev_pos := v_replacement_row.waitlist_position;

    IF (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_row.assigned_group = 'WAITLIST'::assigned_group_enum) OR
       (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_row.rsvp_status IN ('WAITLISTED'::rsvp_status)) THEN
       
       -- Promote waitlist participant to JOINED / GOING
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = 'JOINED'::rsvp_status,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    ELSE
       -- Non-waitlist external friend (e.g. SKIPPED, LEFT, REMOVED) -> invite them anew
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = 'INVITED'::rsvp_status,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

       IF v_replacement_row.rsvp_status != 'INVITED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (p_plan_id, v_caller_id, p_replacement_user_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);
       END IF;
    END IF;

  ELSE
    -- Completely new friend -> invite them
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      skip_reason
    ) VALUES (
      p_plan_id,
      p_replacement_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      CASE WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      NULL,
      NULL
    );

    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (p_plan_id, v_caller_id, p_replacement_user_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);
  END IF;

  -- 7. Renumber waitlist positions if replacement was on waitlist to prevent gaps
  IF v_replacement_prev_pos IS NOT NULL THEN
    WITH renumbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC) AS new_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND waitlist_position IS NOT NULL
    )
    UPDATE public.plan_participants p
       SET waitlist_position = r.new_pos
      FROM renumbered r
     WHERE p.id = r.id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;
