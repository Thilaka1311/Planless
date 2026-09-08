-- Migration: Create atomic trigger on plan_participants for delayed wallet transfer on replacement join
-- Description: Transfers the target (original) participant's wallet obligation to the replacement participant ONLY when the replacement participant's rsvp_status transitions to JOINED.

CREATE OR REPLACE FUNCTION public.handle_replacement_wallet_transfer_on_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_leave_req_row      RECORD;
  v_target_user_id     UUID;
  v_expense_id         UUID;
  v_target_amount_owed NUMERIC := 0;
  v_target_amount_paid NUMERIC := 0;
BEGIN
  -- Only trigger when rsvp_status changes to JOINED
  IF TG_OP = 'UPDATE' AND NEW.rsvp_status = 'JOINED'::rsvp_status AND (OLD.rsvp_status IS DISTINCT FROM 'JOINED'::rsvp_status) THEN
    
    -- 1. Check if NEW.user_id is a replacement_user_id in a resolved leave_requested activity for NEW.plan_id
    SELECT target_user_id, id INTO v_leave_req_row
      FROM public.plan_activity
     WHERE plan_id = NEW.plan_id
       AND activity_type = 'leave_requested'::plan_activity_type
       AND metadata->>'status' = 'RESOLVED'
       AND metadata->>'resolution' = 'REPLACED'
       AND (metadata->>'replacement_user_id')::UUID = NEW.user_id
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_leave_req_row.target_user_id IS NOT NULL THEN
      v_target_user_id := v_leave_req_row.target_user_id;

      -- 2. Find the plan-level default expense for this plan
      SELECT id INTO v_expense_id
        FROM public.wallet_expenses
       WHERE plan_id = NEW.plan_id AND message_id IS NULL
       LIMIT 1;

      IF v_expense_id IS NOT NULL THEN
        -- 3. Extract the target (original) participant's obligation if present
        SELECT COALESCE(amount_owed, 0), COALESCE(amount_paid, 0)
          INTO v_target_amount_owed, v_target_amount_paid
          FROM public.wallet_expense_participants
         WHERE expense_id = v_expense_id AND user_id = v_target_user_id;

        IF FOUND THEN
          -- 4. Transfer obligation: Create/Upsert replacement participant row with target's obligation
          INSERT INTO public.wallet_expense_participants (
            expense_id, user_id, amount_owed, amount_paid, status, created_at, updated_at
          ) VALUES (
            v_expense_id, NEW.user_id, v_target_amount_owed, v_target_amount_paid, 'PENDING', now(), now()
          )
          ON CONFLICT (expense_id, user_id) DO UPDATE
             SET amount_owed = EXCLUDED.amount_owed,
                 updated_at  = now();

          -- 5. Clear target (original) participant's wallet obligation row
          DELETE FROM public.wallet_expense_participants
           WHERE expense_id = v_expense_id AND user_id = v_target_user_id;
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_replacement_wallet_transfer_on_join ON public.plan_participants;

CREATE TRIGGER trg_handle_replacement_wallet_transfer_on_join
AFTER UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.handle_replacement_wallet_transfer_on_join();
