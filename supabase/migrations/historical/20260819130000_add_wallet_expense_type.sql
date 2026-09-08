-- Migration: Add wallet_expense_type enum and column to wallet_expenses
-- Description: Distinguishes automatically generated Plan Expenses (PLAN_EXPENSE) from manually added Additional Expenses (ADDITIONAL_EXPENSE).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_expense_type') THEN
    CREATE TYPE wallet_expense_type AS ENUM ('PLAN_EXPENSE', 'ADDITIONAL_EXPENSE');
  END IF;
END $$;

-- 1. Add expense_type column to wallet_expenses
ALTER TABLE public.wallet_expenses
ADD COLUMN IF NOT EXISTS expense_type wallet_expense_type DEFAULT 'ADDITIONAL_EXPENSE';

-- 2. Backfill existing wallet_expenses records
-- Mark default plan fee expenses as PLAN_EXPENSE
UPDATE public.wallet_expenses
SET expense_type = 'PLAN_EXPENSE'
WHERE message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense' OR title IS NULL OR title = '');

-- Mark all custom / manually added expenses as ADDITIONAL_EXPENSE
UPDATE public.wallet_expenses
SET expense_type = 'ADDITIONAL_EXPENSE'
WHERE message_id IS NOT NULL OR (title != 'Plan Fee' AND title != 'Plan Expense');

-- 3. Update insert_cost_expense RPC to set expense_type = 'ADDITIONAL_EXPENSE'
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

  -- 2. Insert wallet_expense row as ADDITIONAL_EXPENSE
  INSERT INTO wallet_expenses (plan_id, message_id, payer_id, title, total_amount, status, expense_type)
  VALUES (p_plan_id, p_message_id, p_payer_id, p_title, p_total_amount, 'PENDING', 'ADDITIONAL_EXPENSE')
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

-- 4. Update recalculate_wallet_expenses RPC to explicitly operate on expense_type = 'PLAN_EXPENSE'
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
      AND rsvp_status IN ('JOINED', 'WAITLISTED') 
      AND user_id != v_host_id;
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  -- Update legacy cost_per_participant for JOINED and WAITLISTED participants
  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id 
    AND rsvp_status IN ('JOINED', 'WAITLISTED');

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

  -- Remove participant rows for users no longer in JOINED or WAITLISTED, EXCEPT PRESERVE SETTLED RECORDS
  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND rsvp_status IN ('JOINED', 'WAITLISTED')
    );

  -- Upsert participant shares for all JOINED and WAITLISTED participants, PRESERVING existing 'SETTLED' status
  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status IN ('JOINED', 'WAITLISTED')
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_wallet_expenses(UUID) TO authenticated;
