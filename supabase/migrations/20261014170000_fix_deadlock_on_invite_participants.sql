-- Migration: 20261014170000_fix_deadlock_on_invite_participants.sql
-- Description: Standardize lock acquisition order across plan & participant operations
-- to eliminate 40P01 deadlocks between invite_participants and recalculate_wallet_expenses.
--
-- Lock Order Invariant: All transactions mutating a plan or its participants MUST acquire
-- an exclusive row lock on public.plans (FOR UPDATE) BEFORE updating or locking public.plan_participants.

-- ============================================================================
-- 1. RECALCULATE_WALLET_EXPENSES (Standardize Lock Order)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_wallet_expenses(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_cost       NUMERIC;
  v_host_id          UUID;
  v_existing_payer   UUID;
  v_plan_size        INTEGER;
  v_share            NUMERIC;
  v_expense_id       UUID;
BEGIN
  -- 1. Standardize lock order: Always lock the parent plan row FOR UPDATE first!
  -- This serializes wallet recalculation with invite_participants, join_plan, etc.,
  -- preventing foreign key verification (RI_FKey_check_upd / FOR KEY SHARE) from
  -- deadlocking with concurrent participant mutations.
  SELECT total_cost, plan_size
  INTO v_total_cost, v_plan_size
  FROM public.plans 
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.plan_participants SET cost_per_participant = NULL WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    DELETE FROM public.wallet_expenses 
    WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'));
    RETURN;
  END IF;

  SELECT payer_id INTO v_existing_payer
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'))
  LIMIT 1;

  IF v_existing_payer IS NOT NULL THEN
    v_host_id := v_existing_payer;
  ELSE
    SELECT user_id INTO v_host_id
    FROM public.plan_participants
    WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_host_id IS NULL THEN RETURN; END IF;

  IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
    v_share := ROUND((v_total_cost / v_plan_size)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_plan_size
    FROM public.plan_participants
    WHERE plan_id = p_plan_id 
      AND rsvp_status = 'JOINED';
    v_share := CASE WHEN v_plan_size > 0
                    THEN ROUND((v_total_cost / v_plan_size)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id 
    AND rsvp_status = 'JOINED';

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

  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND (
          rsvp_status = 'JOINED'
          OR (rsvp_status = 'SKIPPED' AND skip_reason = 'PAYMENT_KEPT')
        )
    );

  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        updated_at = NOW();

END;
$function$;

ALTER FUNCTION public.recalculate_wallet_expenses(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.recalculate_wallet_expenses(uuid) TO authenticated, service_role;

-- ============================================================================
-- 2. INVITE_PARTICIPANTS (Canonical Sorting & Deduplication)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id uuid,
  p_invitee_user_ids uuid[],
  p_assigned_group assigned_group_enum DEFAULT NULL::assigned_group_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_sorted_invitees UUID[];
  v_existing_status rsvp_status;
  v_existing_waitlist_pos INT;
  v_participant_exists BOOLEAN;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_current_plan_size INT;
  v_current_invited INT;
  v_next_pos INT;
BEGIN
  -- 1. Identify authenticated user from JWT context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch caller's role in the plan
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 3. Fetch plan settings & filtering mode, locking row FOR UPDATE
  SELECT allow_participant_invites, participant_filtering,
         plan_size,
         COALESCE(invited_participants, 0)
    INTO v_allow_participant_invites, v_filtering,
         v_current_plan_size, v_current_invited
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Ensure v_current_invited accurately reflects current active participants
  SELECT COUNT(*)
    INTO v_current_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- 4. Authorization Check
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  -- Determine effective assigned_group:
  -- In Automatic mode: always NULL
  -- In Assigned mode:
  --   If called by a PARTICIPANT: always 'WAITLIST' (participants cannot assign to GOING)
  --   If called by a HOST: respect p_assigned_group, defaulting to 'GOING'
  IF v_filtering IS NULL OR v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role THEN
    v_target_assigned_group := 'WAITLIST'::assigned_group_enum;
  ELSE
    v_target_assigned_group := COALESCE(p_assigned_group, 'GOING'::assigned_group_enum);
  END IF;

  -- 5. Canonicalize invitees: Deduplicate and sort in ascending order to guarantee
  -- strictly deterministic row lock acquisition order across concurrent transactions.
  IF p_invitee_user_ids IS NOT NULL THEN
    SELECT ARRAY(
      SELECT DISTINCT u
        FROM unnest(p_invitee_user_ids) AS u
       WHERE u IS NOT NULL
       ORDER BY u ASC
    ) INTO v_sorted_invitees;
  ELSE
    v_sorted_invitees := ARRAY[]::UUID[];
  END IF;

  -- 6. Process invitees in deterministic order
  IF v_sorted_invitees IS NOT NULL AND array_length(v_sorted_invitees, 1) > 0 THEN
    FOREACH v_invitee_id IN ARRAY v_sorted_invitees
    LOOP
      -- Check if participant record already exists
      SELECT rsvp_status, waitlist_position
        INTO v_existing_status, v_existing_waitlist_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id
         FOR UPDATE;

      v_participant_exists := FOUND;

      -- Determine waitlist position if placed into WAITLIST
      IF v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        SELECT COALESCE(MAX(waitlist_position), 0) + 1
          INTO v_next_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum;
      ELSE
        v_next_pos := NULL;
      END IF;

      IF v_participant_exists THEN
        IF v_existing_status = 'SKIPPED'::rsvp_status THEN
          -- Reactivation (SKIPPED -> active INVITED)
          v_current_invited := v_current_invited + 1;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 waitlist_position = CASE
                   WHEN v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
                     COALESCE(waitlist_position, v_next_pos)
                   ELSE NULL
                 END,
                 responded_at = NULL,
                 skip_reason = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        END IF;
        -- If already active (INVITED, JOINED, WAITLISTED), do nothing (idempotent duplicate invite)
      ELSE
        -- Insert new participant record as INVITED
        v_current_invited := v_current_invited + 1;

        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          assigned_group,
          joined_queue_at,
          waitlist_position,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          v_next_pos,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 7. Persist invited_participants only (plan_size remains unchanged)
  UPDATE public.plans
     SET invited_participants = v_current_invited,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'assigned_group',       v_target_assigned_group::text,
    'invited_participants', v_current_invited
  );
END;
$$;

ALTER FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO authenticated, service_role;

-- ============================================================================
-- 3. REORDER_WAITLIST (Standardize Lock Order)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reorder_waitlist(
  p_plan_id UUID,
  p_ordered_user_ids UUID[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_waitlist_mode participant_filtering_type;
BEGIN
  -- Standardize lock order: Always lock the parent plan row FOR UPDATE first
  SELECT participant_filtering 
    INTO v_waitlist_mode 
    FROM public.plans 
   WHERE id = p_plan_id
     FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_waitlist_mode = 'AUTOMATIC' THEN
    RAISE EXCEPTION 'Cannot reorder waitlist in Automatic mode' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plans
  SET waitlist_order_mode = 'CUSTOM'
  WHERE id = p_plan_id 
    AND (waitlist_order_mode IS DISTINCT FROM 'CUSTOM');

  UPDATE public.plan_participants AS pp
  SET waitlist_position = 1000 + u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;

  UPDATE public.plan_participants AS pp
  SET waitlist_position = u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;
END;
$$;

ALTER FUNCTION public.reorder_waitlist(uuid, uuid[]) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.reorder_waitlist(uuid, uuid[]) TO authenticated, service_role;

-- ============================================================================
-- 4. REPLACE_PARTICIPANT (Standardize Lock Order)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.replace_participant(
  p_plan_id uuid,
  p_target_user_id uuid,
  p_replacement_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id              UUID;
  v_target_row             RECORD;
  v_replacement_row        RECORD;
  v_replacement_found      BOOLEAN := FALSE;
  v_target_was_going       BOOLEAN := FALSE;
  v_replacement_prev_pos   INT := NULL;
  v_filtering_mode         participant_filtering_type;
  v_remaining_hosts        INT;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller host authorization
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can replace participants' USING ERRCODE = '40300';
  END IF;

  -- Standardize lock order: lock plan FOR UPDATE first
  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Lock target participant row
  SELECT role, assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
    RAISE EXCEPTION 'Target participant has already left the plan' USING ERRCODE = '40000';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    SELECT COUNT(*) INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status != 'SKIPPED'::rsvp_status
       AND user_id != p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot replace the sole host. Promote another host first.' USING ERRCODE = '40000';
    END IF;
  END IF;

  v_target_was_going := (v_target_row.assigned_group = 'GOING'::assigned_group_enum);

  -- 4. Mark target participant as SKIPPED with REPLACED reason
  UPDATE public.plan_participants
     SET rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'REPLACED'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         leave_requested   = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 5. Lock and inspect replacement participant
  SELECT role, assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
     FOR UPDATE;

  v_replacement_found := FOUND;

  IF v_replacement_found THEN
    v_replacement_prev_pos := v_replacement_row.waitlist_position;

    UPDATE public.plan_participants
       SET rsvp_status       = 'INVITED'::rsvp_status,
           assigned_group    = CASE
             WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_target_was_going
               THEN 'GOING'::assigned_group_enum
             WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type
               THEN 'WAITLIST'::assigned_group_enum
             ELSE NULL
           END,
           waitlist_position = NULL,
           skip_reason       = NULL,
           leave_requested   = FALSE,
           leave_requested_at = NULL,
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
  ELSE
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      responded_at,
      skip_reason
    ) VALUES (
      p_plan_id,
      p_replacement_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      CASE
        WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_target_was_going
          THEN 'GOING'::assigned_group_enum
        WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type
          THEN 'WAITLIST'::assigned_group_enum
        ELSE NULL
      END,
      NULL,
      NULL,
      NULL
    );
  END IF;

  -- 6. If replacement vacated a waitlist spot, renumber remaining waitlist
  IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_prev_pos IS NOT NULL THEN
    UPDATE public.plan_participants pp
       SET waitlist_position = rd.new_pos,
           updated_at        = now()
      FROM (
        SELECT user_id,
               ROW_NUMBER() OVER (ORDER BY waitlist_position ASC, created_at ASC) AS new_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum
           AND waitlist_position IS NOT NULL
           AND user_id != p_replacement_user_id
           AND rsvp_status != 'SKIPPED'::rsvp_status
      ) rd
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rd.user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',                 true,
    'plan_id',                 p_plan_id,
    'target_user_id',          p_target_user_id,
    'replacement_user_id',     p_replacement_user_id,
    'target_was_going',        v_target_was_going,
    'replacement_assigned_group', CASE
      WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_target_was_going THEN 'GOING'
      WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'WAITLIST'
      ELSE NULL
    END
  );
END;
$function$;

ALTER FUNCTION public.replace_participant(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.replace_participant(uuid, uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 5. SWAP_PLAN_PARTICIPANTS (Standardize Lock Order)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.swap_plan_participants(
  p_plan_id        UUID,
  p_going_user_id  UUID,
  p_waitlist_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id      UUID;
  v_going_row      RECORD;
  v_waitlist_row   RECORD;
  v_new_waitlist_pos INT;
BEGIN
  -- 1. Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller is active HOST of this plan
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: only hosts can swap participants' USING ERRCODE = '40300';
  END IF;

  -- Standardize lock order: Lock plan row FOR UPDATE first
  PERFORM 1 FROM public.plans WHERE id = p_plan_id FOR UPDATE;

  -- 3. Fetch both current participant rows (lock for update)
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_going_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_going_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Going participant not found' USING ERRCODE = '40400';
  END IF;

  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_waitlist_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_waitlist_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist participant not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Invariant checks
  IF v_going_row.assigned_group <> 'GOING'::assigned_group_enum THEN
    RAISE EXCEPTION 'p_going_user_id is not in GOING group' USING ERRCODE = '40000';
  END IF;

  IF v_waitlist_row.assigned_group <> 'WAITLIST'::assigned_group_enum THEN
    RAISE EXCEPTION 'p_waitlist_user_id is not in WAITLIST group' USING ERRCODE = '40000';
  END IF;

  IF v_going_row.rsvp_status = 'SKIPPED'::rsvp_status OR v_waitlist_row.rsvp_status = 'SKIPPED'::rsvp_status THEN
    RAISE EXCEPTION 'Cannot swap a skipped participant' USING ERRCODE = '40000';
  END IF;

  v_new_waitlist_pos := v_waitlist_row.waitlist_position;

  -- 5. Swap groups atomically
  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                               ELSE rsvp_status
                             END,
         waitlist_position = NULL,
         joined_queue_at   = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_waitlist_user_id;

  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_new_waitlist_pos,
         joined_queue_at   = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_going_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'promoted_user_id', p_waitlist_user_id,
    'demoted_user_id', p_going_user_id,
    'waitlist_position', v_new_waitlist_pos
  );
END;
$$;

ALTER FUNCTION public.swap_plan_participants(uuid, uuid, uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.swap_plan_participants(uuid, uuid, uuid) TO authenticated, service_role;
