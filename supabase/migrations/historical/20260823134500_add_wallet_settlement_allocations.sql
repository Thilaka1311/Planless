-- Migration: Add Wallet Settlement Allocations and refactor settlement RPCs
-- Description: Introduces the wallet_settlement_allocations table for expense-level tracking of settlements.

-- 1. Add plan_id to wallet_settlements
ALTER TABLE public.wallet_settlements 
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wallet_settlements_plan_id ON public.wallet_settlements(plan_id);

-- 2. Create wallet_settlement_allocations table
CREATE TABLE IF NOT EXISTS public.wallet_settlement_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.wallet_settlements(id) ON DELETE CASCADE,
    expense_participant_id UUID NOT NULL REFERENCES public.wallet_expense_participants(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_settlement_allocations_settlement_id ON public.wallet_settlement_allocations(settlement_id);
CREATE INDEX IF NOT EXISTS idx_wallet_settlement_allocations_expense_participant_id ON public.wallet_settlement_allocations(expense_participant_id);

ALTER TABLE public.wallet_settlement_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view allocations they are part of"
    ON public.wallet_settlement_allocations FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.wallet_settlements s 
        WHERE s.id = settlement_id AND (s.payer_id = auth.uid() OR s.receiver_id = auth.uid())
      )
    );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_settlement_allocations;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 3. Replace create_wallet_settlement RPC
CREATE OR REPLACE FUNCTION public.create_wallet_settlement(
    p_other_user_id UUID,
    p_amount NUMERIC,
    p_plan_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id UUID;
    v_payer_id UUID;
    v_receiver_id UUID;
    v_gross_caller_owes NUMERIC := 0;
    v_gross_other_owes NUMERIC := 0;
    v_net_caller_owes NUMERIC := 0;
    v_net_other_owes NUMERIC := 0;
    v_max_settleable NUMERIC := 0;
    v_new_settlement public.wallet_settlements%ROWTYPE;
    
    v_remaining_amount NUMERIC;
    v_allocation_amount NUMERIC;
    v_expense_row RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to create a settlement.';
    END IF;

    IF v_caller_id = p_other_user_id THEN
        RAISE EXCEPTION 'Cannot create a settlement with yourself.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero.';
    END IF;

    -- Calculate gross expenses caller owes other
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_caller_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = p_other_user_id
      AND pt.user_id = v_caller_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    -- Calculate gross expenses other owes caller
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_other_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = v_caller_id
      AND pt.user_id = p_other_user_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    v_net_caller_owes := v_gross_caller_owes;
    v_net_other_owes := v_gross_other_owes;

    IF v_net_caller_owes > v_net_other_owes THEN
        -- Caller is debtor, other is creditor
        v_payer_id := v_caller_id;
        v_receiver_id := p_other_user_id;
        v_max_settleable := v_net_caller_owes - v_net_other_owes;
    ELSIF v_net_other_owes > v_net_caller_owes THEN
        -- Other is debtor, caller is creditor
        v_payer_id := p_other_user_id;
        v_receiver_id := v_caller_id;
        v_max_settleable := v_net_other_owes - v_net_caller_owes;
    ELSE
        RAISE EXCEPTION 'No outstanding balance owed between users to settle.';
    END IF;

    IF (p_amount - v_max_settleable) > 0.01 THEN
        RAISE EXCEPTION 'Settlement amount (₹%) exceeds current outstanding balance (₹%).', p_amount, v_max_settleable;
    END IF;

    -- Insert settlement
    INSERT INTO public.wallet_settlements (
        payer_id,
        receiver_id,
        amount,
        plan_id,
        created_at,
        updated_at
    )
    VALUES (
        v_payer_id,
        v_receiver_id,
        p_amount,
        p_plan_id,
        now(),
        now()
    )
    RETURNING * INTO v_new_settlement;

    -- Allocate sequentially (oldest first)
    v_remaining_amount := p_amount;

    FOR v_expense_row IN
        SELECT pt.id, pt.amount_owed, pt.amount_paid
        FROM public.wallet_expense_participants pt
        JOIN public.wallet_expenses e ON e.id = pt.expense_id
        WHERE e.payer_id = v_receiver_id
          AND pt.user_id = v_payer_id
          AND pt.amount_owed > pt.amount_paid
          AND (p_plan_id IS NULL OR e.plan_id = p_plan_id)
        ORDER BY e.created_at ASC, e.id ASC
        FOR UPDATE OF pt
    LOOP
        IF v_remaining_amount <= 0 THEN
            EXIT;
        END IF;

        v_allocation_amount := LEAST(v_remaining_amount, v_expense_row.amount_owed - v_expense_row.amount_paid);

        IF v_allocation_amount > 0 THEN
            -- Record allocation
            INSERT INTO public.wallet_settlement_allocations (
                settlement_id,
                expense_participant_id,
                amount
            ) VALUES (
                v_new_settlement.id,
                v_expense_row.id,
                v_allocation_amount
            );

            -- Update participant row
            UPDATE public.wallet_expense_participants
            SET amount_paid = amount_paid + v_allocation_amount,
                status = CASE 
                            WHEN amount_paid + v_allocation_amount >= amount_owed THEN 'PAID'::participant_payment_status
                            ELSE 'PARTIALLY_PAID'::participant_payment_status
                         END,
                updated_at = now()
            WHERE id = v_expense_row.id;

            v_remaining_amount := v_remaining_amount - v_allocation_amount;
        END IF;
    END LOOP;

    RETURN to_jsonb(v_new_settlement);
END;
$$;

-- 4. Replace delete_wallet_settlement RPC
CREATE OR REPLACE FUNCTION public.delete_wallet_settlement(
    p_settlement_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_caller_id UUID;
    v_target_settlement public.wallet_settlements%ROWTYPE;
    v_alloc RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete a settlement.';
    END IF;

    SELECT * INTO v_target_settlement
    FROM public.wallet_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement record not found.';
    END IF;

    IF v_target_settlement.payer_id <> v_caller_id AND v_target_settlement.receiver_id <> v_caller_id THEN
        RAISE EXCEPTION 'Not authorized to delete this settlement.';
    END IF;

    -- Check if it's a historical settlement without allocations
    IF NOT EXISTS (SELECT 1 FROM public.wallet_settlement_allocations WHERE settlement_id = p_settlement_id) THEN
        RAISE EXCEPTION 'This historical settlement cannot be reversed because it has no expense allocation records.';
    END IF;

    -- Reverse allocations
    FOR v_alloc IN
        SELECT expense_participant_id, amount
        FROM public.wallet_settlement_allocations
        WHERE settlement_id = p_settlement_id
    LOOP
        -- Lock and update the participant
        UPDATE public.wallet_expense_participants
        SET amount_paid = amount_paid - v_alloc.amount,
            status = CASE 
                        WHEN amount_paid - v_alloc.amount <= 0 THEN 'PENDING'::participant_payment_status
                        ELSE 'PARTIALLY_PAID'::participant_payment_status
                     END,
            updated_at = now()
        WHERE id = v_alloc.expense_participant_id;
    END LOOP;

    -- Delete the settlement (allocations cascade)
    DELETE FROM public.wallet_settlements
    WHERE id = p_settlement_id;

    RETURN jsonb_build_object('success', true, 'id', p_settlement_id);
END;
$$;

-- 5. Update recalculate_wallet_expenses to preserve amount_paid
-- Need to fetch the existing definition and modify the UPSERT to not override amount_paid.
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
    AND status != 'SETTLED' AND status != 'PAID'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND rsvp_status IN ('JOINED', 'WAITLISTED')
    );

  -- Upsert participant shares for all JOINED and WAITLISTED participants, PRESERVING existing 'SETTLED/PAID' status and amount_paid
  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status IN ('JOINED', 'WAITLISTED')
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        -- Preserve the status if it's already PAID or SETTLED
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   WHEN wallet_expense_participants.status = 'PAID' THEN 'PAID'
                   -- Check if new amount_owed is satisfied by existing amount_paid
                   WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'PAID'
                   WHEN wallet_expense_participants.amount_paid > 0 THEN 'PARTIALLY_PAID'
                   ELSE EXCLUDED.status 
                 END,
        -- amount_paid is intentionally NOT updated from EXCLUDED
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_wallet_expenses(UUID) TO authenticated;
