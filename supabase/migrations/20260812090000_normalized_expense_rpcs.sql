-- Migration: Create normalized expense RPCs
-- 1. Replace old recalculate_wallet_expenses with new normalized version
-- 2. Add insert_cost_expense atomic RPC for Add Cost chat flow

-- Replace recalculate_wallet_expenses to use new normalized schema
CREATE OR REPLACE FUNCTION public.recalculate_wallet_expenses(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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
  FROM plans WHERE id = p_plan_id;

  IF v_host_id IS NULL THEN RETURN; END IF;

  -- Clear legacy cost_per_participant
  UPDATE plan_participants SET cost_per_participant = NULL WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    DELETE FROM wallet_expenses WHERE plan_id = p_plan_id AND message_id IS NULL;
    RETURN;
  END IF;

  -- Determine share amount
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM plan_participants
    WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED' AND user_id != v_host_id;
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  -- Update legacy cost_per_participant
  UPDATE plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

  -- Upsert single plan-level wallet_expense (no message_id = plan default expense)
  SELECT id INTO v_expense_id FROM wallet_expenses
  WHERE plan_id = p_plan_id AND message_id IS NULL LIMIT 1;

  IF v_expense_id IS NULL THEN
    INSERT INTO wallet_expenses (plan_id, payer_id, title, total_amount, status)
    VALUES (p_plan_id, v_host_id, COALESCE(v_plan_title, 'Plan Expense'), v_total_cost, 'PENDING')
    RETURNING id INTO v_expense_id;
  ELSE
    UPDATE wallet_expenses
    SET total_amount = v_total_cost, updated_at = NOW()
    WHERE id = v_expense_id;
  END IF;

  -- Remove participant rows for users no longer JOINED
  DELETE FROM wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND user_id NOT IN (
      SELECT user_id FROM plan_participants
      WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'
    );

  -- Upsert participant shares for all JOINED participants
  INSERT INTO wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM plan_participants pp
  WHERE pp.plan_id = p_plan_id AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE SET amount_owed = EXCLUDED.amount_owed, updated_at = NOW();
END;
$$;

-- Atomic RPC for Add Cost chat expense insertion
CREATE OR REPLACE FUNCTION public.insert_cost_expense(
  p_plan_id       UUID,
  p_message_id    UUID,
  p_payer_id      UUID,
  p_title         TEXT,
  p_total_amount  NUMERIC,
  p_participant_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expense_id UUID;
  v_share      NUMERIC;
  v_count      INTEGER;
  v_uid        UUID;
BEGIN
  v_count := COALESCE(array_length(p_participant_ids, 1), 1);
  IF v_count = 0 THEN v_count := 1; END IF;
  v_share := ROUND((p_total_amount / v_count)::NUMERIC, 2);

  INSERT INTO wallet_expenses (plan_id, message_id, payer_id, title, total_amount, status)
  VALUES (p_plan_id, p_message_id, p_payer_id, p_title, p_total_amount, 'PENDING')
  RETURNING id INTO v_expense_id;

  FOREACH v_uid IN ARRAY p_participant_ids
  LOOP
    INSERT INTO wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
    VALUES (v_expense_id, v_uid, v_share, 0, 'PENDING')
    ON CONFLICT (expense_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_expense_id;
END;
$$;
