-- ============================================================================
-- Migration: Update joined_queue_at timestamp logic and RPC queue ordering
-- Description: Ensures joined_queue_at is updated when participants enter queue
--              and strictly orders automatic promotions by joined_queue_at ASC.
-- ============================================================================

-- 1. Trigger function to automatically maintain joined_queue_at on insert/update
CREATE OR REPLACE FUNCTION public.trg_maintain_joined_queue_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.joined_queue_at IS NULL THEN
      NEW.joined_queue_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If rsvp_status transitions to JOINED or WAITLISTED from INVITED or SKIPPED, update timestamp
    IF NEW.rsvp_status IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)
       AND (OLD.rsvp_status IS NULL OR OLD.rsvp_status NOT IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)) THEN
      NEW.joined_queue_at := now();
    ELSIF NEW.joined_queue_at IS NULL THEN
      NEW.joined_queue_at := COALESCE(OLD.joined_queue_at, OLD.created_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_joined_queue_at_trigger ON public.plan_participants;

CREATE TRIGGER trg_maintain_joined_queue_at_trigger
BEFORE INSERT OR UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_maintain_joined_queue_at();

-- 2. Update auto_promote_waitlist_for_automatic to order strictly by joined_queue_at ASC
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
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND OR v_filtering <> 'AUTOMATIC' OR v_max_p IS NULL OR v_max_p <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  -- Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max_p - v_joined_count;

  IF v_available <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  -- Promote waitlisted participants in FIFO queue order (joined_queue_at ASC)
  FOR v_rec IN
    SELECT user_id
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY joined_queue_at ASC, created_at ASC
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

  PERFORM set_config('app.system_op', 'false', true);
  RETURN v_promoted;
END;
$$;

-- 3. Update update_plan_capacity demotion & promotion logic to preserve and use joined_queue_at
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
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_creator_id, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 2 THEN
    RAISE EXCEPTION 'Capacity must be at least 2' USING ERRCODE = '42601';
  END IF;

  UPDATE public.plans
     SET max_participants = p_max_participants,
         updated_at       = now()
   WHERE id = p_plan_id;

  -- Capacity reduction: demote overflow Going → Waitlist
  -- Order by joined_queue_at ASC so earliest queued participants stay in JOINED
  WITH ranked_participants AS (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY joined_queue_at ASC, created_at ASC) AS pos
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

  -- Capacity increase on AUTOMATIC plans: fill new slots from Waitlist
  IF v_filtering = 'AUTOMATIC' THEN
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants,
    'promoted_count',   v_promoted_count
  );
END;
$$;
