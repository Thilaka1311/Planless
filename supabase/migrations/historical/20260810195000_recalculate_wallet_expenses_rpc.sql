-- Migration: Create recalculate_wallet_expenses SECURITY DEFINER RPC
--
-- This RPC is called from the frontend Supabase client after any participant
-- join/leave/swap action. It runs with elevated permissions (SECURITY DEFINER)
-- to bypass RLS on plan_participants, which otherwise blocks bulk cost_per_participant
-- updates for non-host callers.
--
-- Calculation rule:
--   cost_per_participant = plans.total_cost / plans.max_participants
--   This is populated ONLY for participants whose rsvp_status = 'JOINED'.
--   All other RSVP states (INVITED, WAITLISTED, SKIPPED) keep cost_per_participant = NULL.

CREATE OR REPLACE FUNCTION recalculate_wallet_expenses(p_plan_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_cost     NUMERIC;
  v_host_id        UUID;
  v_max_participants INTEGER;
  v_share          NUMERIC;
BEGIN
  -- Fetch plan details
  SELECT total_cost, host_id, max_participants
  INTO v_total_cost, v_host_id, v_max_participants
  FROM plans
  WHERE id = p_plan_id;

  IF v_host_id IS NULL THEN
    RETURN;
  END IF;

  -- Clear all cost_per_participant for this plan (non-JOINED → NULL)
  UPDATE plan_participants
  SET cost_per_participant = NULL
  WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    -- No cost: remove all wallet_expenses for this plan
    DELETE FROM wallet_expenses WHERE plan_id = p_plan_id;
    RETURN;
  END IF;

  -- cost_per_participant = total_cost / max_participants (fixed capacity divisor).
  -- Falls back to splitting among current JOINED non-host participants only when
  -- max_participants is not set on the plan.
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    -- No capacity limit: fallback to current joined count
    SELECT COUNT(*)
    INTO v_max_participants
    FROM plan_participants
    WHERE plan_id = p_plan_id
      AND rsvp_status = 'JOINED'
      AND user_id != v_host_id;

    IF v_max_participants > 0 THEN
      v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
    ELSE
      v_share := v_total_cost;
    END IF;
  END IF;

  -- Set cost_per_participant for JOINED participants only
  UPDATE plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id
    AND rsvp_status = 'JOINED';

  -- Remove wallet_expenses for participants no longer JOINED
  DELETE FROM wallet_expenses
  WHERE plan_id = p_plan_id
    AND sender_id NOT IN (
      SELECT user_id FROM plan_participants
      WHERE plan_id = p_plan_id
        AND rsvp_status = 'JOINED'
        AND user_id != v_host_id
    );

  -- Upsert wallet_expenses for each JOINED non-host participant
  -- Uses UNIQUE (plan_id, sender_id) constraint for ON CONFLICT
  INSERT INTO wallet_expenses (plan_id, sender_id, receiver_id, cost_per_participant, rsvp_status, status, created_at, updated_at)
  SELECT
    pp.plan_id,
    pp.user_id,
    v_host_id,
    v_share,
    pp.rsvp_status,
    'PENDING',
    NOW(),
    NOW()
  FROM plan_participants pp
  WHERE pp.plan_id = p_plan_id
    AND pp.rsvp_status = 'JOINED'
    AND pp.user_id != v_host_id
  ON CONFLICT (plan_id, sender_id)
  DO UPDATE SET
    cost_per_participant = EXCLUDED.cost_per_participant,
    rsvp_status          = EXCLUDED.rsvp_status,
    updated_at           = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION recalculate_wallet_expenses(UUID) TO public;

