-- Migration: Add remove_expense_participant_and_redistribute RPC
-- Description: Removes an unsettled participant from a wallet expense and deterministically redistributes the total amount across remaining participants.

CREATE OR REPLACE FUNCTION public.remove_expense_participant_and_redistribute(
  p_expense_id           UUID,
  p_participant_user_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id       UUID;
  v_payer_id        UUID;
  v_plan_id         UUID;
  v_plan_host_id    UUID;
  v_total_amount    NUMERIC;
  v_expense_type    wallet_expense_type;
  v_pt_status       TEXT;
  v_pt_name         TEXT;
  v_remaining_count INT;
  v_base_share      NUMERIC;
  v_remainder       NUMERIC;
  v_curr_idx        INT := 0;
  v_rec             RECORD;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch expense details
  SELECT payer_id, plan_id, total_amount, expense_type
    INTO v_payer_id, v_plan_id, v_total_amount, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Fetch plan host
  IF v_plan_id IS NOT NULL THEN
    SELECT host_id INTO v_plan_host_id FROM public.plans WHERE id = v_plan_id;
  END IF;

  -- 3. Authorization check: Caller must be the expense payer OR the plan host
  IF v_caller_id != v_payer_id AND (v_plan_host_id IS NULL OR v_caller_id != v_plan_host_id) THEN
    RAISE EXCEPTION 'Not authorized to modify this expense' USING ERRCODE = '40300';
  END IF;

  -- 4. Fetch target participant record
  SELECT status INTO v_pt_status
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant is not part of this expense' USING ERRCODE = '40400';
  END IF;

  -- Fetch user name for error messages
  SELECT COALESCE(full_name, username, 'Participant') INTO v_pt_name
    FROM public.users WHERE id = p_participant_user_id;

  -- 5. Block deletion if split is already SETTLED
  IF UPPER(COALESCE(v_pt_status, 'PENDING')) = 'SETTLED' THEN
    RAISE EXCEPTION 'Cannot remove settled split. % has already settled this expense.', v_pt_name USING ERRCODE = '40000';
  END IF;

  -- 6. Check remaining participant count
  SELECT COUNT(*) INTO v_remaining_count
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id != p_participant_user_id;

  IF v_remaining_count <= 0 THEN
    RAISE EXCEPTION 'An expense must have at least one participant.' USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- 7. Remove selected participant
  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  -- 8. Deterministic share calculation across remaining participants
  v_base_share := TRUNC((v_total_amount / v_remaining_count)::numeric, 2);
  v_remainder := v_total_amount - (v_base_share * v_remaining_count);

  -- Update each remaining participant row
  FOR v_rec IN 
    SELECT user_id FROM public.wallet_expense_participants
     WHERE expense_id = p_expense_id
     ORDER BY created_at ASC, user_id ASC
  LOOP
    v_curr_idx := v_curr_idx + 1;
    UPDATE public.wallet_expense_participants
       SET amount_owed = v_base_share + (CASE WHEN v_curr_idx = 1 THEN v_remainder ELSE 0 END),
           updated_at = NOW()
     WHERE expense_id = p_expense_id AND user_id = v_rec.user_id;
  END LOOP;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'removed_user_id', p_participant_user_id,
    'remaining_count', v_remaining_count,
    'total_amount', v_total_amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_expense_participant_and_redistribute(UUID, UUID) TO authenticated;
