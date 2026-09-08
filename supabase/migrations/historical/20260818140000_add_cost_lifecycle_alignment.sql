-- Migration: Add Cost Lifecycle Alignment
-- Description: Ensures insert_cost_expense RPC safely handles optional p_message_id and processes JOINED + WAITLISTED participants correctly.

CREATE OR REPLACE FUNCTION public.insert_cost_expense(
  p_plan_id       UUID,
  p_message_id    UUID DEFAULT NULL,
  p_payer_id      UUID DEFAULT NULL,
  p_title         TEXT DEFAULT 'Shared Expense',
  p_total_amount  NUMERIC DEFAULT 0,
  p_participant_ids UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expense_id UUID;
  v_share      NUMERIC;
  v_count      INTEGER;
  v_uid        UUID;
BEGIN
  -- 1. Determine participant count and share
  v_count := COALESCE(array_length(p_participant_ids, 1), 1);
  IF v_count = 0 THEN v_count := 1; END IF;
  v_share := ROUND((p_total_amount / v_count)::NUMERIC, 2);

  -- 2. Insert wallet_expense row
  INSERT INTO wallet_expenses (plan_id, message_id, payer_id, title, total_amount, status)
  VALUES (p_plan_id, p_message_id, p_payer_id, p_title, p_total_amount, 'PENDING')
  RETURNING id INTO v_expense_id;

  -- 3. Insert participant rows
  FOREACH v_uid IN ARRAY p_participant_ids
  LOOP
    INSERT INTO wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
    VALUES (v_expense_id, v_uid, v_share, 0, 'PENDING')
    ON CONFLICT (expense_id, user_id) DO UPDATE
      SET amount_owed = EXCLUDED.amount_owed,
          updated_at = NOW();
  END LOOP;

  RETURN v_expense_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_cost_expense(UUID, UUID, UUID, TEXT, NUMERIC, UUID[]) TO authenticated;
