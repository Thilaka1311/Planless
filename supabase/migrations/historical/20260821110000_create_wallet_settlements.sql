-- Migration: 20260821110000_create_wallet_settlements.sql
-- Description: Implement Wallet Settlements table and server-side RPCs for relationship-level settlements.

-- 1. Create wallet_settlements table
CREATE TABLE IF NOT EXISTS public.wallet_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_payer_not_receiver CHECK (payer_id <> receiver_id)
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_wallet_settlements_payer_receiver ON public.wallet_settlements (payer_id, receiver_id);
CREATE INDEX IF NOT EXISTS idx_wallet_settlements_created_at ON public.wallet_settlements (created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.wallet_settlements ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view settlements they are part of" ON public.wallet_settlements;
CREATE POLICY "Users can view settlements they are part of"
    ON public.wallet_settlements FOR SELECT
    USING (auth.uid() = payer_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Parties can insert settlements" ON public.wallet_settlements;
CREATE POLICY "Parties can insert settlements"
    ON public.wallet_settlements FOR INSERT
    WITH CHECK (auth.uid() = payer_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Parties can delete settlements" ON public.wallet_settlements;
CREATE POLICY "Parties can delete settlements"
    ON public.wallet_settlements FOR DELETE
    USING (auth.uid() = payer_id OR auth.uid() = receiver_id);

-- Add to realtime publication if available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_settlements;
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- 4. Server-Side RPC: create_wallet_settlement
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

    -- Calculate existing settlements caller paid other
    SELECT COALESCE(SUM(s.amount), 0)
    INTO v_settlements_caller_paid
    FROM public.wallet_settlements s
    WHERE s.payer_id = v_caller_id
      AND s.receiver_id = p_other_user_id;

    -- Calculate existing settlements other paid caller
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

-- 5. Server-Side RPC: delete_wallet_settlement
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
