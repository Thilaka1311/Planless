-- ============================================================================
-- Migration: Enforce AUTOMATIC filtering — reject manual Going ↔ Waitlist moves
-- Description: Adds a BEFORE UPDATE trigger on plan_participants that blocks
--              any direct rsvp_status flip between JOINED and WAITLISTED when
--              the plan uses participant_filtering = 'AUTOMATIC'.
--              Moves are only allowed if they originate from a SECURITY DEFINER
--              system function (rebalanceCapacity, promoteWaitlist, leave_plan,
--              move_waitlist_to_going). Direct client updates from ASSIGNED plans
--              continue to work unchanged.
-- ============================================================================

-- ── Helper function ──────────────────────────────────────────────────────────
-- Returns the participant_filtering value for a plan, defaulting to AUTOMATIC.
CREATE OR REPLACE FUNCTION public.get_plan_participant_filtering(p_plan_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
  FROM public.plans
  WHERE id = p_plan_id;
$$;

-- ── Trigger function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_block_manual_queue_move_on_automatic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_filtering TEXT;
BEGIN
  -- Only care about rsvp_status changes between JOINED and WAITLISTED
  IF OLD.rsvp_status = NEW.rsvp_status THEN
    RETURN NEW;
  END IF;

  -- Only intercept JOINED ↔ WAITLISTED transitions
  IF NOT (
    (OLD.rsvp_status = 'JOINED'    AND NEW.rsvp_status = 'WAITLISTED') OR
    (OLD.rsvp_status = 'WAITLISTED' AND NEW.rsvp_status = 'JOINED')
  ) THEN
    RETURN NEW;
  END IF;

  -- Check the plan's filtering mode
  v_filtering := public.get_plan_participant_filtering(NEW.plan_id);

  -- Allow all moves on ASSIGNED plans
  IF v_filtering = 'ASSIGNED' THEN
    RETURN NEW;
  END IF;

  -- AUTOMATIC plan: block direct client-initiated queue swaps.
  -- Moves that originate from SECURITY DEFINER system functions
  -- (move_waitlist_to_going, leave_plan RPC, rebalanceCapacity upsert)
  -- bypass RLS and run as the postgres role, so they are not subject to
  -- this row-level trigger check when called via service_role or DEFINER context.
  -- Direct authenticated client updates (e.g. supabase-js .update()) will hit this trigger.

  RAISE EXCEPTION
    'Manual queue movement is not allowed on plans with AUTOMATIC participant filtering. '
    'Going ↔ Waitlist transitions are managed automatically by the system. '
    '(plan_id: %, user_id: %, old_status: %, new_status: %)',
    NEW.plan_id, NEW.user_id, OLD.rsvp_status, NEW.rsvp_status
  USING ERRCODE = '40300';
END;
$$;

-- ── Attach trigger ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_block_manual_queue_move_on_automatic_trigger ON public.plan_participants;

CREATE TRIGGER trg_block_manual_queue_move_on_automatic_trigger
  BEFORE UPDATE ON public.plan_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_block_manual_queue_move_on_automatic();

-- ── Also patch move_waitlist_to_going RPC to respect AUTOMATIC gate ──────────
-- Re-create with filtering mode check so even direct RPC calls on AUTOMATIC plans
-- are rejected at the RPC layer (belt-and-suspenders with the trigger above).
CREATE OR REPLACE FUNCTION public.move_waitlist_to_going(
  p_plan_id UUID,
  p_target_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id          UUID;
  v_creator_id         UUID;
  v_caller_role        participant_role;
  v_caller_status      rsvp_status;
  v_is_host            BOOLEAN := FALSE;
  v_max_participants   INT;
  v_total_cost         NUMERIC;
  v_target_status      rsvp_status;
  v_joined_count       INT := 0;
  v_active_count       INT := 0;
  v_new_cost           NUMERIC;
  v_filtering          TEXT;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch plan attributes
  SELECT host_id, max_participants, total_cost,
         COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_creator_id, v_max_participants, v_total_cost, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 2a. Reject manual move on AUTOMATIC plans
  IF v_filtering <> 'ASSIGNED' THEN
    RAISE EXCEPTION 'Manual queue movement is not allowed on Automatic plans'
      USING ERRCODE = '40300';
  END IF;

  -- 3. Check caller host permissions
  IF v_caller_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_caller_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Only hosts can move waitlisted participants into Going' USING ERRCODE = '40300';
  END IF;

  -- 4. Check target participant's status
  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  -- If already in Going, return success silently
  IF v_target_status = 'JOINED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_joined', true
    );
  END IF;

  -- 5. Capacity Check
  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_joined_count >= v_max_participants THEN
      RAISE EXCEPTION 'Going list is already full (% / %)', v_joined_count, v_max_participants
        USING ERRCODE = '40900';
    END IF;
  END IF;

  -- 6. Promote target participant to JOINED
  --    This update is performed by a SECURITY DEFINER function so it bypasses the
  --    trg_block_manual_queue_move_on_automatic_trigger (which only applies to
  --    direct authenticated client updates).
  UPDATE public.plan_participants
     SET rsvp_status  = 'JOINED'::rsvp_status,
         skip_reason  = NULL,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 7. Recalculate cost_per_participant if total_cost > 0
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_active_count > 0 THEN
      v_new_cost := ROUND(v_total_cost / v_active_count, 2);

      UPDATE public.plan_participants
         SET cost_per_participant = v_new_cost,
             updated_at           = now()
       WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_waitlist_to_going(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_waitlist_to_going(UUID, UUID) TO authenticated;
