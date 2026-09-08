-- Migration: Wallet Plan-Fee Obligations for Joined Participants Only (Preserving Amount Paid Logic)
-- Description: Updates recalculate_wallet_expenses RPC so that ONLY JOINED participants receive a plan-fee obligation. WAITLISTED, INVITED and SKIPPED participants have no obligation.

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
    DELETE FROM public.wallet_expenses 
    WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'));
    RETURN;
  END IF;

  -- Determine share amount
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM public.plan_participants
    WHERE plan_id = p_plan_id 
      AND rsvp_status = 'JOINED' 
      AND user_id != v_host_id;
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  -- Update legacy cost_per_participant for JOINED participants only
  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id 
    AND rsvp_status = 'JOINED';

  -- Upsert single plan-level PLAN_EXPENSE wallet_expense
  SELECT id INTO v_expense_id FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee')) LIMIT 1;

  IF v_expense_id IS NULL THEN
    INSERT INTO public.wallet_expenses (plan_id, payer_id, title, total_amount, status, expense_type)
    VALUES (p_plan_id, v_host_id, 'Plan Fee', v_total_cost, 'PENDING', 'PLAN_EXPENSE')
    RETURNING id INTO v_expense_id;
  ELSE
    UPDATE public.wallet_expenses
    SET total_amount = v_total_cost, expense_type = 'PLAN_EXPENSE', updated_at = NOW()
    WHERE id = v_expense_id;
  END IF;

  -- Remove participant rows for users no longer in JOINED, EXCEPT PRESERVE SETTLED RECORDS
  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND rsvp_status = 'JOINED'
    );

  -- Upsert participant shares for all JOINED participants, PRESERVING existing 'SETTLED' status and amount_paid
  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        -- Preserve the status if it's already SETTLED
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   -- Check if new amount_owed is satisfied by existing amount_paid
                   WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        -- amount_paid is intentionally NOT updated from EXCLUDED
        updated_at = NOW();
END;
$$;
