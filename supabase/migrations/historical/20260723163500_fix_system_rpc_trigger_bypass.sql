-- ============================================================================
-- Migration: Fix BEFORE UPDATE trigger on plan_participants for SECURITY DEFINER RPCs
-- Description: Triggers in Postgres run under the session role (auth.role = 'authenticated'),
--              even when invoked inside a SECURITY DEFINER function.
--              To allow SECURITY DEFINER system functions (like update_plan_capacity,
--              leave_plan, auto_promote_waitlist_for_automatic) to update rsvp_status
--              while STILL blocking direct client-initiated SQL updates on AUTOMATIC plans,
--              we check pg_trigger_depth() or a session setting.
--              When an internal RPC function executes, pg_trigger_depth() is either >= 1
--              (or we bypass if current_user = 'postgres').
-- ============================================================================

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

  -- Allow updates originating from within a PL/pgSQL function or trigger (depth > 1)
  -- or if current session setting 'app.system_op' is set, or if running as superuser/postgres.
  IF pg_trigger_depth() > 1 OR current_user = 'postgres' OR current_setting('app.system_op', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Check the plan's filtering mode
  v_filtering := public.get_plan_participant_filtering(NEW.plan_id);

  -- Allow all moves on ASSIGNED plans
  IF v_filtering = 'ASSIGNED' THEN
    RETURN NEW;
  END IF;

  -- Block direct authenticated client-initiated SQL updates (e.g. supabase.from('plan_participants').update(...))
  RAISE EXCEPTION
    'Manual queue movement is not allowed on plans with AUTOMATIC participant filtering. '
    'Going ↔ Waitlist transitions are managed automatically by the system. '
    '(plan_id: %, user_id: %, old_status: %, new_status: %)',
    NEW.plan_id, NEW.user_id, OLD.rsvp_status, NEW.rsvp_status
  USING ERRCODE = '40300';
END;
$$;

-- Also update update_plan_capacity SECURITY DEFINER RPC to set 'app.system_op' = 'true'
-- so its internal UPDATE statements are recognized as system operations by triggers.
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
  -- Set session flag for system operation
  PERFORM set_config('app.system_op', 'true', true);

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
  IF v_filtering = 'AUTOMATIC' THEN
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  -- Reset system flag
  PERFORM set_config('app.system_op', 'false', true);

  -- 9. Return JSON response
  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants,
    'promoted_count',   v_promoted_count
  );
END;
$$;

-- Also update auto_promote_waitlist_for_automatic helper to set app.system_op = 'true'
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

  -- 1. Check filtering mode
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_p
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  IF v_filtering <> 'AUTOMATIC' THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  IF v_max_p IS NULL OR v_max_p <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
    RETURN 0;
  END IF;

  -- 2. Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max_p - v_joined_count;

  IF v_available <= 0 THEN
    PERFORM set_config('app.system_op', 'false', true);
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

  PERFORM set_config('app.system_op', 'false', true);
  RETURN v_promoted;
END;
$$;
