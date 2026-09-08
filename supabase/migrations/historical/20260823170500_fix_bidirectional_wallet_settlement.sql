-- Fix create_wallet_settlement to support bidirectional netting allocations across mutual expenses
CREATE OR REPLACE FUNCTION public.create_wallet_settlement(
    p_other_user_id uuid,
    p_amount numeric,
    p_plan_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_id UUID;
    v_payer_id UUID;
    v_receiver_id UUID;
    v_gross_caller_owes NUMERIC := 0;
    v_gross_other_owes NUMERIC := 0;
    v_max_settleable NUMERIC := 0;
    v_offset NUMERIC := 0;
    v_new_settlement public.wallet_settlements%ROWTYPE;
    
    v_remaining_offset NUMERIC := 0;
    v_remaining_primary NUMERIC := 0;
    v_allocation_amount NUMERIC := 0;
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

    -- 1. Calculate gross expenses caller owes other
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_caller_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = p_other_user_id
      AND pt.user_id = v_caller_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    -- 2. Calculate gross expenses other owes caller
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_other_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = v_caller_id
      AND pt.user_id = p_other_user_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    -- 3. Determine Net Direction and Mutual Offset
    IF v_gross_caller_owes > v_gross_other_owes THEN
        -- Caller is net debtor, Other is net creditor
        v_payer_id := v_caller_id;
        v_receiver_id := p_other_user_id;
        v_max_settleable := v_gross_caller_owes - v_gross_other_owes;
        v_offset := v_gross_other_owes;
    ELSIF v_gross_other_owes > v_gross_caller_owes THEN
        -- Other is net debtor, Caller is net creditor
        v_payer_id := p_other_user_id;
        v_receiver_id := v_caller_id;
        v_max_settleable := v_gross_other_owes - v_gross_caller_owes;
        v_offset := v_gross_caller_owes;
    ELSE
        RAISE EXCEPTION 'No outstanding balance owed between users to settle.';
    END IF;

    IF (p_amount - v_max_settleable) > 0.01 THEN
        RAISE EXCEPTION 'Settlement amount (₹%) exceeds current outstanding balance (₹%).', p_amount, v_max_settleable;
    END IF;

    -- 4. Insert settlement record
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

    -- 5. Perform Opposing Netting Allocations (offsetting debts where v_payer_id was creditor and v_receiver_id was debtor)
    IF v_offset > 0 THEN
        v_remaining_offset := v_offset;

        FOR v_expense_row IN
            SELECT pt.id, pt.amount_owed, pt.amount_paid
            FROM public.wallet_expense_participants pt
            JOIN public.wallet_expenses e ON e.id = pt.expense_id
            WHERE e.payer_id = v_payer_id
              AND pt.user_id = v_receiver_id
              AND pt.amount_owed > pt.amount_paid
              AND (p_plan_id IS NULL OR e.plan_id = p_plan_id)
            ORDER BY e.created_at ASC, e.id ASC
            FOR UPDATE OF pt
        LOOP
            IF v_remaining_offset <= 0 THEN
                EXIT;
            END IF;

            v_allocation_amount := LEAST(v_remaining_offset, v_expense_row.amount_owed - v_expense_row.amount_paid);

            IF v_allocation_amount > 0 THEN
                INSERT INTO public.wallet_settlement_allocations (
                    settlement_id,
                    expense_participant_id,
                    amount
                ) VALUES (
                    v_new_settlement.id,
                    v_expense_row.id,
                    v_allocation_amount
                );

                UPDATE public.wallet_expense_participants
                SET amount_paid = amount_paid + v_allocation_amount,
                    status = CASE 
                                WHEN amount_paid + v_allocation_amount >= amount_owed THEN 'SETTLED'::participant_payment_status
                                ELSE 'PENDING'::participant_payment_status
                             END,
                    updated_at = now()
                WHERE id = v_expense_row.id;

                v_remaining_offset := v_remaining_offset - v_allocation_amount;
            END IF;
        END LOOP;
    END IF;

    -- 6. Perform Primary Allocations (where v_payer_id is debtor and v_receiver_id is creditor)
    v_remaining_primary := p_amount + (v_offset - COALESCE(v_remaining_offset, 0));

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
        IF v_remaining_primary <= 0 THEN
            EXIT;
        END IF;

        v_allocation_amount := LEAST(v_remaining_primary, v_expense_row.amount_owed - v_expense_row.amount_paid);

        IF v_allocation_amount > 0 THEN
            INSERT INTO public.wallet_settlement_allocations (
                settlement_id,
                expense_participant_id,
                amount
            ) VALUES (
                v_new_settlement.id,
                v_expense_row.id,
                v_allocation_amount
            );

            UPDATE public.wallet_expense_participants
            SET amount_paid = amount_paid + v_allocation_amount,
                status = CASE 
                            WHEN amount_paid + v_allocation_amount >= amount_owed THEN 'SETTLED'::participant_payment_status
                            ELSE 'PENDING'::participant_payment_status
                         END,
                updated_at = now()
            WHERE id = v_expense_row.id;

            v_remaining_primary := v_remaining_primary - v_allocation_amount;
        END IF;
    END LOOP;

    RETURN to_jsonb(v_new_settlement);
END;
$function$;
