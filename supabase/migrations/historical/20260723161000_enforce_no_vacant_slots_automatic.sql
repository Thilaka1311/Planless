-- ============================================================================
-- Migration: Enforce "no vacant Going slots while Waitlist is non-empty"
--            for plans with participant_filtering = 'AUTOMATIC'
-- ============================================================================
-- Strategy:
--   1. Create a shared auto_promote_waitlist_for_automatic() helper that fills
--      all vacancies in one atomic pass.
--   2. Patch update_plan_capacity to call it after capacity increases.
--   3. Add an AFTER UPDATE trigger on plan_participants that calls it whenever
--      a JOINED slot becomes vacant (SKIPPED, WAITLISTED, INVITED etc.) on an
--      AUTOMATIC plan — this is the universal catch-all for leave / remove /
--      any other Going → non-Going transition.
-- ============================================================================

-- ── 1. Shared helper ─────────────────────────────────────────────────────────
-- Fills all vacant Going slots on an AUTOMATIC plan from the Waitlist (queue
-- order = created_at ASC).  Returns the number of participants promoted.
-- SECURITY DEFINER so it can write plan_participants regardless of RLS /
-- who called the parent operation (the trigger fires as the pg user).
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(p_plan_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_filtering      TEXT;
  v_max_p          INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
BEGIN
  -- 1. Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Only act on AUTOMATIC plans
  IF v_filtering <> 'AUTOMATIC' THEN
    RETURN 0;
  END IF;

  -- Unlimited capacity — nothing to enforce
  IF v_max_p IS NULL OR v_max_p <= 0 THEN
    RETURN 0;
  END IF;

  -- 2. Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max_p - v_joined_count;

  IF v_available <= 0 THEN
    RETURN 0;
  END IF;

  -- 3. Promote waitlisted participants in queue order (created_at ASC)
  FOR v_rec IN
    SELECT user_id
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY created_at ASC
     LIMIT v_available
  LOOP
    UPDATE public.plan_participants
       SET rsvp_status  = 'JOINED'::rsvp_status,
           skip_reason  = NULL,
           responded_at = now(),
           updated_at   = now()
     WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN v_promoted;
END;
$$;

-- ── 2. Update update_plan_capacity to promote after capacity increase ─────────
-- When capacity goes UP the old code only handles demotion (capacity down).
-- We now also call auto_promote_waitlist_for_automatic so increasing capacity
-- on an AUTOMATIC plan immediately fills new slots.
CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id          UUID,
  p_max_participants INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID;
  v_creator_id     UUID;
  v_caller_role    participant_role;
  v_filtering      TEXT;
  v_promoted_count INT := 0;
BEGIN
  -- 1. Identify authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch the plan
  SELECT host_id, COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_creator_id, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Fetch caller's role in plan_participants (for non-creator hosts)
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 4. Authorization: Creator Host OR Additional Host (HOST / CO_HOST)
  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL; -- Authorized
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  -- 5. Validate capacity (must be at least 2)
  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  -- 6. Update capacity on the plans table
  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- 7. Capacity reduction: demote overflow Going → Waitlist
  --    (oldest Going participants stay; newest are demoted)
  WITH ranked_participants AS (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY created_at ASC) AS pos
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND rsvp_status = 'JOINED'::rsvp_status
  )
  UPDATE public.plan_participants pp
     SET rsvp_status = 'WAITLISTED'::rsvp_status,
         role        = CASE WHEN pp.user_id != v_creator_id THEN 'PARTICIPANT'::participant_role ELSE pp.role END,
         updated_at  = now()
    FROM ranked_participants rp
   WHERE pp.plan_id = p_plan_id
     AND pp.user_id = rp.user_id
     AND rp.pos > p_max_participants;

  -- 8. Capacity increase on AUTOMATIC plans: fill new slots from Waitlist
  --    (ASSIGNED plans leave slot management to the host)
  IF v_filtering = 'AUTOMATIC' THEN
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  -- 9. Return JSON response
  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants,
    'promoted_count',   v_promoted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;

-- ── 3. AFTER UPDATE trigger — universal catch-all ───────────────────────────
-- Fires after any update to plan_participants.rsvp_status.
-- If the old status was JOINED and the new status is anything else (SKIPPED,
-- WAITLISTED, INVITED …) AND the plan uses AUTOMATIC filtering, immediately
-- call auto_promote_waitlist_for_automatic to fill the vacancy.
--
-- This covers: leave_plan RPC, removeParticipant, host-initiated removals,
-- any future operation that changes a JOINED row away from JOINED.
--
-- Note: The trigger is AFTER, so the causal UPDATE has already committed into
-- the same transaction.  auto_promote_waitlist_for_automatic runs as SECURITY
-- DEFINER and bypasses the BEFORE-update blocking trigger (different trigger,
-- different event).
CREATE OR REPLACE FUNCTION public.trg_auto_promote_on_vacancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only react when a JOINED row leaves Going
  IF OLD.rsvp_status = 'JOINED'::rsvp_status AND NEW.rsvp_status != 'JOINED'::rsvp_status THEN
    PERFORM public.auto_promote_waitlist_for_automatic(NEW.plan_id);
  END IF;
  RETURN NULL; -- AFTER triggers ignore return value for row-level
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_on_vacancy_trigger ON public.plan_participants;

CREATE TRIGGER trg_auto_promote_on_vacancy_trigger
  AFTER UPDATE ON public.plan_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_promote_on_vacancy();
