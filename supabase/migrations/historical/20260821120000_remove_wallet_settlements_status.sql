-- Migration: 20260821120000_remove_wallet_settlements_status.sql
-- Description: Remove status column from wallet_settlements, update RLS, update create_wallet_settlement RPC, add delete_wallet_settlement RPC.

-- 1. Remove status column and its constraint
ALTER TABLE public.wallet_settlements DROP COLUMN IF EXISTS status CASCADE;

-- 2. Update RLS policies
DROP POLICY IF EXISTS "Parties can update settlements status" ON public.wallet_settlements;

DROP POLICY IF EXISTS "Parties can delete settlements" ON public.wallet_settlements;
CREATE POLICY "Parties can delete settlements"
    ON public.wallet_settlements FOR DELETE
    USING (auth.uid() = payer_id OR auth.uid() = receiver_id);

-- 3. Replace create_wallet_settlement RPC (without status references)
CREATE OR REPLACE FUNCTION public.create_wallet_settlement(
    p_other_user_id UUID,
    p_amount NUMERIC
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
    v_settlements_caller_paid NUMERIC := 0;
    v_settlements_other_paid NUMERIC := 0;
    v_net_caller_owes NUMERIC := 0;
    v_net_other_owes NUMERIC := 0;
    v_max_settleable NUMERIC := 0;
    v_new_settlement public.wallet_settlements%ROWTYPE;
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
    SELECT COALESCE(SUM(pt.amount_owed), 0)
    INTO v_gross_caller_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = p_other_user_id
      AND pt.user_id = v_caller_id
      AND pt.amount_owed > 0;

    -- Calculate gross expenses other owes caller
    SELECT COALESCE(SUM(pt.amount_owed), 0)
    INTO v_gross_other_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = v_caller_id
      AND pt.user_id = p_other_user_id
      AND pt.amount_owed > 0;

    -- Calculate existing settlements caller paid other (any row in wallet_settlements is valid)
    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_settlements_caller_paid
    FROM public.wallet_settlements s
    WHERE s.payer_id = v_caller_id
      AND s.receiver_id = p_other_user_id;

    -- Calculate existing settlements other paid caller (any row in wallet_settlements is valid)
    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_settlements_other_paid
    FROM public.wallet_settlements s
    WHERE s.payer_id = p_other_user_id
      AND s.receiver_id = v_caller_id;

    v_net_caller_owes := GREATEST(0, v_gross_caller_owes - v_settlements_caller_paid);
    v_net_other_owes := GREATEST(0, v_gross_other_owes - v_settlements_other_paid);

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

    INSERT INTO public.wallet_settlements (
        payer_id,
        receiver_id,
        amount,
        created_at,
        updated_at
    )
    VALUES (
        v_payer_id,
        v_receiver_id,
        p_amount,
        now(),
        now()
    )
    RETURNING * INTO v_new_settlement;

    RETURN to_jsonb(v_new_settlement);
END;
$$;

-- 4. Remove obsolete reverse_wallet_settlement RPC
DROP FUNCTION IF EXISTS public.reverse_wallet_settlement(UUID);

-- 5. Create delete_wallet_settlement RPC
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
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete a settlement.';
    END IF;

    SELECT * INTO v_target_settlement
    FROM public.wallet_settlements
    WHERE id = p_settlement_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement record not found.';
    END IF;

    IF v_target_settlement.payer_id <> v_caller_id AND v_target_settlement.receiver_id <> v_caller_id THEN
        RAISE EXCEPTION 'Not authorized to delete this settlement.';
    END IF;

    DELETE FROM public.wallet_settlements
    WHERE id = p_settlement_id;

    RETURN jsonb_build_object('success', true, 'id', p_settlement_id);
END;
$$;
