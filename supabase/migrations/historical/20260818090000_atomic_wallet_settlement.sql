-- Migration: Atomic Wallet Settlement Engine & Recalculation Safety
-- Description:
-- 1. Creates SECURITY DEFINER RPC settle_wallet_relationship to settle all outstanding obligations from a debtor to the caller (creditor) in one atomic transaction.
-- 2. Creates SECURITY DEFINER RPC settle_wallet_expense to settle a specific expense participant obligation.
-- 3. Updates recalculate_wallet_expenses to preserve 'SETTLED' status on existing participant rows during recalculation.
-- 4. Updates wallet_expense_participants_update RLS policy to restrict direct client updates.

-- 1. Relationship-Level Settlement RPC
CREATE OR REPLACE FUNCTION public.settle_wallet_relationship(
  p_debtor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id    UUID;
  v_settled_rows INTEGER := 0;
  v_exp_row      RECORD;
  v_all_settled  BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF p_debtor_id IS NULL THEN
    RAISE EXCEPTION 'Debtor ID is required' USING ERRCODE = '40000';
  END IF;

  IF v_caller_id = p_debtor_id THEN
    RAISE EXCEPTION 'Self settlement is not allowed' USING ERRCODE = '40000';
  END IF;

  -- 1. Settle all non-settled participant obligations where caller is the creditor (payer_id)
  -- and p_debtor_id is the debtor (user_id)
  WITH target_rows AS (
    SELECT mep.id, mep.expense_id
    FROM public.wallet_expense_participants mep
    JOIN public.wallet_expenses me ON me.id = mep.expense_id
    WHERE me.payer_id = v_caller_id
      AND mep.user_id = p_debtor_id
      AND mep.status != 'SETTLED'
      AND mep.amount_owed > 0
  ),
  updated_rows AS (
    UPDATE public.wallet_expense_participants mep
    SET status = 'SETTLED',
        updated_at = now()
    FROM target_rows tr
    WHERE mep.id = tr.id
    RETURNING mep.expense_id
  )
  SELECT COUNT(*) INTO v_settled_rows FROM updated_rows;

  -- 2. For every affected expense, check if all participants are now SETTLED.
  -- If so, update parent wallet_expenses status to SETTLED.
  FOR v_exp_row IN
    SELECT DISTINCT me.id
    FROM public.wallet_expenses me
    JOIN public.wallet_expense_participants mep ON mep.expense_id = me.id
    WHERE me.payer_id = v_caller_id
      AND mep.user_id = p_debtor_id
  LOOP
    SELECT COALESCE(bool_and(mep.status = 'SETTLED'), false)
    INTO v_all_settled
    FROM public.wallet_expense_participants mep
    WHERE mep.expense_id = v_exp_row.id;

    IF v_all_settled THEN
      UPDATE public.wallet_expenses
      SET status = 'SETTLED',
          updated_at = now()
      WHERE id = v_exp_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'settled_count', v_settled_rows,
    'creditor_id', v_caller_id,
    'debtor_id', p_debtor_id
  );
END;
$$;

-- 2. Single Expense Settlement RPC
CREATE OR REPLACE FUNCTION public.settle_wallet_expense(
  p_expense_id UUID,
  p_debtor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id    UUID;
  v_payer_id     UUID;
  v_settled_rows INTEGER := 0;
  v_all_settled  BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id INTO v_payer_id
  FROM public.wallet_expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Verify caller is creditor (payer_id) or plan host
  IF v_caller_id != v_payer_id AND NOT public.is_plan_host((SELECT plan_id FROM public.wallet_expenses WHERE id = p_expense_id), v_caller_id) THEN
    RAISE EXCEPTION 'Only the creditor can settle this expense' USING ERRCODE = '40300';
  END IF;

  -- Update target participant obligation(s) to SETTLED
  WITH target_rows AS (
    SELECT id FROM public.wallet_expense_participants
    WHERE expense_id = p_expense_id
      AND (p_debtor_id IS NULL OR user_id = p_debtor_id)
      AND status != 'SETTLED'
  ),
  updated_rows AS (
    UPDATE public.wallet_expense_participants
    SET status = 'SETTLED',
        updated_at = now()
    WHERE id IN (SELECT id FROM target_rows)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_settled_rows FROM updated_rows;

  -- Check if all participants for this expense are now SETTLED
  SELECT COALESCE(bool_and(status = 'SETTLED'), false)
  INTO v_all_settled
  FROM public.wallet_expense_participants
  WHERE expense_id = p_expense_id;

  IF v_all_settled THEN
    UPDATE public.wallet_expenses
    SET status = 'SETTLED',
        updated_at = now()
    WHERE id = p_expense_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'settled_count', v_settled_rows,
    'expense_id', p_expense_id,
    'creditor_id', v_caller_id,
    'debtor_id', p_debtor_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_wallet_relationship(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.settle_wallet_expense(UUID, UUID) TO authenticated;

-- 3. Update recalculate_wallet_expenses to preserve 'SETTLED' status
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

  -- Remove participant rows for users no longer JOINED
  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
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

-- 4. Restrict direct client UPDATE on wallet_expense_participants so only creditor or plan host can update directly
DROP POLICY IF EXISTS wallet_expense_participants_update ON public.wallet_expense_participants;
CREATE POLICY wallet_expense_participants_update ON public.wallet_expense_participants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wallet_expenses
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND wallet_expenses.payer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.wallet_expenses
      JOIN public.plans ON plans.id = wallet_expenses.plan_id
      WHERE wallet_expenses.id = wallet_expense_participants.expense_id
        AND plans.host_id = auth.uid()
    )
  );
