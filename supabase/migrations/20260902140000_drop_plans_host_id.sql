-- Migration: Drop plans.host_id
-- Description: Completely drops public.plans.host_id and plans_host_id_fkey after establishing
-- public.plan_participants.role = 'HOST' as the single source of truth for all host authorization.

-- 1. Remove compatibility fallbacks from handle_new_plan_creator_participant
CREATE OR REPLACE FUNCTION public.handle_new_plan_creator_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  v_creator_id := auth.uid();
  
  IF v_creator_id IS NOT NULL THEN
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      v_creator_id,
      'HOST'::participant_role,
      'JOINED'::rsvp_status,
      CASE WHEN NEW.participant_filtering = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      now(),
      now(),
      now()
    )
    ON CONFLICT (plan_id, user_id) DO UPDATE
    SET role = 'HOST'::participant_role,
        rsvp_status = 'JOINED'::rsvp_status;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Remove compatibility fallback from log_plan_lifecycle_activity
CREATE OR REPLACE FUNCTION public.log_plan_lifecycle_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  v_actor_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (
      NEW.id,
      v_actor_id,
      v_actor_id,
      'plan_created'::plan_activity_type,
      jsonb_build_object('title', NEW.title)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.place_name IS DISTINCT FROM NEW.place_name THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_location_changed'::plan_activity_type,
        jsonb_build_object('new_location', NEW.place_name)
      );
    END IF;

    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_datetime_changed'::plan_activity_type,
        jsonb_build_object('old_scheduled_at', OLD.scheduled_at, 'new_scheduled_at', NEW.scheduled_at)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Remove fallback from recalculate_wallet_expenses
CREATE OR REPLACE FUNCTION public.recalculate_wallet_expenses(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_total_cost       NUMERIC;
  v_host_id          UUID;
  v_existing_payer   UUID;
  v_max_participants INTEGER;
  v_share            NUMERIC;
  v_expense_id       UUID;
BEGIN
  SELECT total_cost, max_participants
  INTO v_total_cost, v_max_participants
  FROM public.plans WHERE id = p_plan_id;

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

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM public.plan_participants
    WHERE plan_id = p_plan_id 
      AND rsvp_status = 'JOINED';
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
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
$$;

-- 4. Drop the host_id column and its foreign key constraint from public.plans
ALTER TABLE public.plans DROP COLUMN IF EXISTS host_id CASCADE;
