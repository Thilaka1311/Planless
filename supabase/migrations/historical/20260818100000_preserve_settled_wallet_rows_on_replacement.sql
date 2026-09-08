-- Migration: Preserve Settled Wallet Records During Participant Replacement & Recalculation
-- Description: Updates resolve_paid_plan_leave_request and recalculate_wallet_expenses to preserve 'SETTLED' wallet_expense_participants rows when participants leave or are replaced.

-- 1. Update resolve_paid_plan_leave_request RPC
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
  v_expense_id         UUID;
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

-- 2. Update recalculate_wallet_expenses RPC to preserve SETTLED records when removing non-JOINED participants
CREATE OR REPLACE FUNCTION public.recalculate_wallet_expenses(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_cost       NUMERIC;
  v_host_id          UUID;
  v_max_participants INTEGER;
  v_share            NUMERIC;
  v_expense_id       UUID;
  v_plan_title       TEXT;
BEGIN
  SELECT total_cost, host_id, max_participants, title
  INTO v_total_cost, v_host_id, v_max_participants, v_plan_title
  FROM public.plans WHERE id = p_plan_id;

  IF v_host_id IS NULL THEN RETURN; END IF;

  -- Clear legacy cost_per_participant
  UPDATE public.plan_participants SET cost_per_participant = NULL WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    DELETE FROM public.wallet_expenses WHERE plan_id = p_plan_id AND message_id IS NULL;
    RETURN;
  END IF;

  -- Determine share amount
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM public.plan_participants
    WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED' AND user_id != v_host_id;
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  -- Update legacy cost_per_participant
  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

  -- Upsert single plan-level wallet_expense (no message_id = plan default expense)
  SELECT id INTO v_expense_id FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND message_id IS NULL LIMIT 1;

  IF v_expense_id IS NULL THEN
    INSERT INTO public.wallet_expenses (plan_id, payer_id, title, total_amount, status)
    VALUES (p_plan_id, v_host_id, 'Plan Fee', v_total_cost, 'PENDING')
    RETURNING id INTO v_expense_id;
  ELSE
    UPDATE public.wallet_expenses
    SET total_amount = v_total_cost, updated_at = NOW()
    WHERE id = v_expense_id;
  END IF;

  -- Remove participant rows for users no longer JOINED, EXCEPT PRESERVE SETTLED RECORDS
  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'
    );

  -- Upsert participant shares for all JOINED participants, PRESERVING existing 'SETTLED' status
  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_paid_plan_leave_request(UUID, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_wallet_expenses(UUID) TO authenticated;
