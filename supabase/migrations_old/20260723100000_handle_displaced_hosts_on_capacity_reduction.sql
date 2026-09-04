-- ============================================================================
-- Migration: Handle displaced hosts on capacity reduction & prevent waitlisted hosts
-- Description: Ensures that when plan capacity is updated or when participants are waitlisted/skipped,
--              non-creator hosts automatically lose their HOST role.
-- ============================================================================

-- 1. Create or replace trigger to reset waitlisted/skipped non-creator hosts to PARTICIPANT
CREATE OR REPLACE FUNCTION public.trg_reset_waitlisted_or_skipped_host_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  SELECT host_id INTO v_creator_id
    FROM public.plans
   WHERE id = NEW.plan_id;

  -- Creator Host (plans.host_id) can never be demoted or waitlisted.
  -- Additional hosts automatically revert to PARTICIPANT if WAITLISTED or SKIPPED.
  IF NEW.user_id != v_creator_id AND (NEW.rsvp_status = 'WAITLISTED'::rsvp_status OR NEW.rsvp_status = 'SKIPPED'::rsvp_status) THEN
    NEW.role := 'PARTICIPANT'::participant_role;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_waitlisted_or_skipped_host_role_trigger ON public.plan_participants;
CREATE TRIGGER trg_reset_waitlisted_or_skipped_host_role_trigger
BEFORE INSERT OR UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_reset_waitlisted_or_skipped_host_role();

-- 2. Update update_plan_capacity SECURITY DEFINER RPC to handle displaced participants
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
  v_user_id     UUID;
  v_creator_id  UUID;
  v_caller_role participant_role;
BEGIN
  -- 1. Identify authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch the plan and its creator host
  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Fetch caller's role in plan_participants
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 4. Authorization check: Creator Host OR Additional Host (role IN ('HOST', 'CO_HOST'))
  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL; -- Authorized
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  -- 5. Validate capacity (must be at least 2)
  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  -- 6. Perform update on plans table
  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- 7. Re-assign participants exceeding capacity to WAITLISTED and reset role to PARTICIPANT
  WITH ranked_participants AS (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY created_at ASC) as pos
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

  -- 8. Return JSON response
  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
