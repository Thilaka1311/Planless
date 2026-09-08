-- ============================================================
-- Migration: Automatic Transition & Sync for OVERDUE Plans
-- ============================================================

-- 1. Migrate existing LIVE plans whose scheduled_at is in the past
UPDATE public.plans
SET status = 'OVERDUE'::public.plan_status,
    updated_at = now()
WHERE status = 'LIVE'::public.plan_status
  AND scheduled_at < now();

-- 2. Trigger function to enforce automatic transition to OVERDUE on insert/update
CREATE OR REPLACE FUNCTION public.check_plan_overdue_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If plan is LIVE but its scheduled_at is in the past, transition to OVERDUE
  IF NEW.status = 'LIVE'::public.plan_status AND NEW.scheduled_at < now() THEN
    NEW.status := 'OVERDUE'::public.plan_status;
  -- If an OVERDUE plan is rescheduled to the future, transition back to LIVE
  ELSIF NEW.status = 'OVERDUE'::public.plan_status AND NEW.scheduled_at > now() THEN
    NEW.status := 'LIVE'::public.plan_status;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_plan_overdue ON public.plans;
CREATE TRIGGER trg_check_plan_overdue
BEFORE INSERT OR UPDATE OF status, scheduled_at ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.check_plan_overdue_trigger();

-- 3. RPC function to synchronize overdue plans across the database
CREATE OR REPLACE FUNCTION public.sync_overdue_plans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.plans
  SET status = 'OVERDUE'::public.plan_status,
      updated_at = now()
  WHERE status = 'LIVE'::public.plan_status
    AND scheduled_at < now();
END;
$$;

ALTER FUNCTION public.sync_overdue_plans() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_overdue_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_overdue_plans() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_overdue_plans() TO service_role;

-- 4. Update cancel_plan to ensure COMPLETED plans cannot be cancelled, while LIVE and OVERDUE can
CREATE OR REPLACE FUNCTION public.cancel_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID;
  v_plan_status plan_status;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT status INTO v_plan_status
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may cancel the plan' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'Cannot cancel a completed plan' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$$;

ALTER FUNCTION public.cancel_plan(p_plan_id uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_plan(uuid) TO service_role;

-- 5. Update complete_plan to prevent completing a CANCELLED plan
CREATE OR REPLACE FUNCTION public.complete_plan(
  p_plan_id uuid,
  p_attendance_input jsonb,
  p_expense_mode text DEFAULT 'NONE'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_rsvp_deadline TIMESTAMPTZ;
  v_participant RECORD;
  v_input_attendance attendance_status;
  v_final_attendance attendance_status;
  v_final_state rsvp_status;
  v_final_count INT;
  v_plan_expense RECORD;
  v_share NUMERIC;
  v_final_total_cost NUMERIC;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, scheduled_at, rsvp_deadline, total_cost
  INTO v_plan_status, v_scheduled_at, v_rsvp_deadline, v_final_total_cost
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; 

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_ALREADY_COMPLETED' USING ERRCODE = '40000';
  END IF;

  IF v_plan_status = 'CANCELLED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_CANCELLED' USING ERRCODE = '40000';
  END IF;

  IF jsonb_typeof(p_attendance_input) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE_FORMAT' USING ERRCODE = '40000';
  END IF;

  -- 3. Auto-insert newly added attendees
  INSERT INTO public.plan_participants (
    plan_id, user_id, rsvp_status, final_attendance, final_state, created_at, updated_at
  )
  SELECT
    p_plan_id,
    (item->>'user_id')::UUID,
    'JOINED'::rsvp_status,
    'ATTENDED'::attendance_status,
    'JOINED'::rsvp_status,
    now(),
    now()
  FROM jsonb_array_elements(p_attendance_input) AS arr(item)
  WHERE (item->>'attendance') = 'ATTENDED'
    AND (item->>'user_id')::UUID NOT IN (
      SELECT user_id FROM public.plan_participants WHERE plan_id = p_plan_id
    )
  ON CONFLICT (plan_id, user_id) DO NOTHING;

  -- 4. Finalize attendance for all participants
  FOR v_participant IN
    SELECT user_id, role, rsvp_status, skip_reason
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
    FOR UPDATE
  LOOP
    v_input_attendance := NULL;

    SELECT (item->>'attendance')::attendance_status
    INTO v_input_attendance
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_participant.user_id;

    IF v_participant.user_id = v_caller_id THEN
      -- The completing host is present and verified as attended
      v_final_attendance := 'ATTENDED'::attendance_status;
      v_final_state := 'JOINED'::rsvp_status;

    ELSIF v_input_attendance IS NOT NULL THEN
      v_final_attendance := v_input_attendance;
      IF v_input_attendance = 'ATTENDED'::attendance_status THEN
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;

    ELSE
      -- Fallback for participants not explicitly present in payload
      IF v_participant.rsvp_status = 'JOINED'::rsvp_status THEN
        v_final_attendance := 'ATTENDED'::attendance_status;
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_attendance := 'DID_NOT_ATTEND'::attendance_status;
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;
    END IF;

    UPDATE public.plan_participants
    SET rsvp_status = v_final_state,
        final_attendance = v_final_attendance,
        final_state = v_final_state,
        skip_reason = CASE 
          WHEN v_final_attendance = 'ATTENDED'::attendance_status THEN NULL
          WHEN v_participant.rsvp_status IN ('JOINED'::rsvp_status, 'INVITED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN NULL
          ELSE skip_reason
        END,
        updated_at = now()
    WHERE plan_id = p_plan_id AND user_id = v_participant.user_id;
  END LOOP;

  -- 5. Calculate Final Attended Count
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 6. Handle Plan Expense Recalculation
  IF p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') AND v_final_count > 0 THEN
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id;

    IF FOUND THEN
      IF p_expense_mode = 'SPLIT_ALL' THEN
        v_final_total_cost := v_plan_expense.total_amount;
      ELSIF p_expense_mode = 'KEEP_CURRENT_COST' THEN
        SELECT COALESCE(SUM(initial_share), 0) INTO v_final_total_cost
        FROM public.wallet_expense_participants
        WHERE expense_id = v_plan_expense.id;
      END IF;

      v_share := ROUND((v_final_total_cost / v_final_count), 2);

      UPDATE public.wallet_expenses
      SET total_amount = v_final_total_cost,
          split_type = 'EQUAL'::split_type,
          updated_at = now()
      WHERE id = v_plan_expense.id;

      FOR v_participant IN
        SELECT user_id, final_attendance
        FROM public.plan_participants
        WHERE plan_id = p_plan_id
      LOOP
        IF v_participant.final_attendance = 'ATTENDED'::attendance_status THEN
          INSERT INTO public.wallet_expense_participants (
            expense_id, user_id, share_amount, initial_share, status, created_at, updated_at
          )
          VALUES (
            v_plan_expense.id,
            v_participant.user_id,
            CASE WHEN v_participant.user_id = v_plan_expense.payer_id THEN 0.00 ELSE v_share END,
            v_share,
            'PENDING',
            now(),
            now()
          )
          ON CONFLICT (expense_id, user_id)
          DO UPDATE SET
            share_amount = CASE WHEN EXCLUDED.user_id = v_plan_expense.payer_id THEN 0.00 ELSE v_share END,
            initial_share = v_share,
            updated_at = now()
          WHERE wallet_expense_participants.status != 'SETTLED';
        ELSE
          UPDATE public.wallet_expense_participants
          SET share_amount = 0.00,
              initial_share = 0.00,
              updated_at = now()
          WHERE expense_id = v_plan_expense.id
            AND user_id = v_participant.user_id
            AND status != 'SETTLED';
        END IF;
      END LOOP;

    END IF;
  END IF;

  -- 7. Update Plan Status & attended_participants & total_cost
  IF now() < v_scheduled_at THEN
    v_scheduled_at := now();
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      attended_participants = v_final_count,
      total_cost = v_final_total_cost,
      scheduled_at = v_scheduled_at,
      rsvp_deadline = v_rsvp_deadline,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'COMPLETED',
    'attended_participants', v_final_count,
    'final_count', v_final_count,
    'total_cost', v_final_total_cost,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );
END;
$$;

ALTER FUNCTION public.complete_plan(uuid, jsonb, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_plan(uuid, jsonb, text) TO service_role;
