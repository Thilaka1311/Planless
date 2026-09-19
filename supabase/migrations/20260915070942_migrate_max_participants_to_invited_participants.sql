-- Migration: 20260915070942_migrate_max_participants_to_invited_participants.sql
-- Description: Phase 2 Database Migration
--   1. Rename plans.max_participants -> plans.invited_participants
--   2. Update sync_plan_participant_cost_share and trigger on plans (BEFORE any plans updates)
--   3. Update plans constraints (invited_participants >= 0, plan_size >= 1, no plan_size <= invited_participants check)
--   4. Sync existing invited_participants counts
--   5. Create participant count maintenance trigger on plan_participants
--   6. Update update_plan_capacity(uuid, integer) to use p_plan_size and update plan_size only
--   7. Update move_participant_to_waitlist_and_decrease_capacity to decrement plan_size only
--   8. Update invite_participants with capacity rule:
--      IF plan_size == invited_participants: plan_size += 1, invited_participants += 1
--      ELSE: invited_participants += 1, plan_size unchanged
--   9. Update claim_plan_invite with same capacity vs active count separation
--  10. Update capacity/waitlist functions to use plan_size for capacity:
--      auto_promote_waitlist_for_assigned, auto_promote_waitlist_for_automatic,
--      switch_to_automatic_waitlist_mode, move_waitlist_to_going, leave_plan, remove_participant
--  11. Update cost calculations to use plan_size:
--      recalculate_wallet_expenses, set_participant_cost_share_on_join, sync_plan_participant_cost_share
--  12. Update manage_completed_plan_participants and resolve_paid_plan_leave_request

-- ============================================================================
-- 1. SCHEMA RENAME & EARLY TRIGGER UPDATE
-- ============================================================================

-- Drop old cost sync trigger and replace function first so UPDATE on plans won't fail
DROP TRIGGER IF EXISTS trigger_sync_plan_participant_cost_share ON public.plans;

-- Rename max_participants -> invited_participants (preserving all data)
ALTER TABLE public.plans RENAME COLUMN max_participants TO invited_participants;

-- Recreate cost sync function to use plan_size instead of max_participants
CREATE OR REPLACE FUNCTION public.sync_plan_participant_cost_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_share NUMERIC(10,2) := 0;
BEGIN
  -- Compute per participant share from NEW total_cost and plan_size
  IF NEW.total_cost IS NOT NULL AND NEW.total_cost > 0 AND NEW.plan_size IS NOT NULL AND NEW.plan_size > 0 THEN
    v_share := ROUND(NEW.total_cost / NEW.plan_size, 2);
  ELSE
    v_share := 0;
  END IF;

  -- Update active (JOINED) participants
  UPDATE public.plan_participants
     SET cost_per_participant = v_share,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status = 'JOINED'::rsvp_status;

  -- Clear non-active participants
  UPDATE public.plan_participants
     SET cost_per_participant = NULL,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status != 'JOINED'::rsvp_status;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_sync_plan_participant_cost_share
  AFTER UPDATE OF total_cost, plan_size ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_plan_participant_cost_share();

-- ============================================================================
-- 2. CONSTRAINTS & INITIAL DATA SYNC
-- ============================================================================

-- Drop obsolete constraints
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS check_max_participants;
ALTER TABLE public.plans DROP CONSTRAINT IF EXISTS check_plan_size_bounds;

-- Add updated constraints (Do NOT require plan_size <= invited_participants)
ALTER TABLE public.plans ADD CONSTRAINT check_invited_participants_nonnegative
  CHECK (invited_participants IS NULL OR invited_participants >= 0);

ALTER TABLE public.plans ADD CONSTRAINT check_plan_size_bounds
  CHECK (plan_size IS NULL OR plan_size >= 1);

-- Sync initial invited_participants for any existing rows to exact count of non-skipped participants
UPDATE public.plans p
   SET invited_participants = (
     SELECT COUNT(*)
       FROM public.plan_participants pp
      WHERE pp.plan_id = p.id
        AND pp.rsvp_status != 'SKIPPED'::rsvp_status
   );

-- ============================================================================
-- 3. PARTICIPANT COUNT MAINTENANCE TRIGGER ON plan_participants
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_maintain_plan_invited_participants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_plan_id UUID;
  v_should_sync BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_plan_id := NEW.plan_id;
    IF NEW.rsvp_status != 'SKIPPED'::rsvp_status THEN
      v_should_sync := TRUE;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_plan_id := OLD.plan_id;
    IF OLD.rsvp_status != 'SKIPPED'::rsvp_status THEN
      v_should_sync := TRUE;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    v_plan_id := NEW.plan_id;
    IF (OLD.rsvp_status = 'SKIPPED'::rsvp_status) <> (NEW.rsvp_status = 'SKIPPED'::rsvp_status) THEN
      v_should_sync := TRUE;
    END IF;
  END IF;

  IF v_should_sync THEN
    UPDATE public.plans
       SET invited_participants = (
         SELECT COUNT(*)
           FROM public.plan_participants
          WHERE plan_id = v_plan_id
            AND rsvp_status != 'SKIPPED'::rsvp_status
       ),
       updated_at = now()
     WHERE id = v_plan_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_plan_invited_participants ON public.plan_participants;
CREATE TRIGGER trg_maintain_plan_invited_participants
  AFTER INSERT OR UPDATE OF rsvp_status OR DELETE
  ON public.plan_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_maintain_plan_invited_participants();

-- ============================================================================
-- 3.1. QUEUE TIMESTAMP TRIGGER (Only active joiners receive joined_queue_at)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_maintain_joined_queue_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_filtering TEXT;
BEGIN
  -- Determine plan filtering mode
  v_filtering := public.get_plan_participant_filtering(NEW.plan_id);

  -- For ASSIGNED plans, joined_queue_at is not used and must remain NULL
  IF v_filtering = 'ASSIGNED' THEN
    NEW.joined_queue_at := NULL;
    RETURN NEW;
  END IF;

  -- For AUTOMATIC plans, maintain FCFS queue timestamps:
  -- Only participants who actively joined or entered waitlist receive joined_queue_at.
  -- Still-invited or skipped participants MUST have joined_queue_at = NULL.
  IF TG_OP = 'INSERT' THEN
    IF NEW.rsvp_status IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN
      IF NEW.joined_queue_at IS NULL THEN
        NEW.joined_queue_at := now();
      END IF;
    ELSE
      NEW.joined_queue_at := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If rsvp_status transitions to JOINED or WAITLISTED from INVITED or SKIPPED, set timestamp
    IF NEW.rsvp_status IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)
       AND (OLD.rsvp_status IS NULL OR OLD.rsvp_status NOT IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)) THEN
      NEW.joined_queue_at := now();
    ELSIF NEW.rsvp_status NOT IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN
      NEW.joined_queue_at := NULL;
    ELSIF NEW.joined_queue_at IS NULL THEN
      NEW.joined_queue_at := COALESCE(OLD.joined_queue_at, OLD.created_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 4. UPDATE_PLAN_CAPACITY (p_plan_size integer)
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_plan_capacity(uuid, integer);

CREATE OR REPLACE FUNCTION public.update_plan_capacity(p_plan_id uuid, p_plan_size integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id            UUID;
  v_filtering          TEXT;
  v_promoted_count     INT := 0;
  v_demoted_count      INT := 0;
  v_host_count         INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_plan_size IS NULL OR p_plan_size < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  -- Update plan_size (the actual joined capacity)
  -- It must NOT update invited_participants.
  UPDATE public.plans
     SET plan_size   = p_plan_size,
         updated_at  = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    -- 1. Capacity decrease: demote overflow JOINED participants to WAITLISTED
    SELECT COUNT(*) INTO v_host_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status;

    WITH ranked_joined AS (
      SELECT pp.user_id,
             ROW_NUMBER() OVER (
               ORDER BY pp.joined_queue_at ASC NULLS LAST,
                        COALESCE(u.full_name, u.username, '') ASC
             ) AS pos
        FROM public.plan_participants pp
        LEFT JOIN public.users u ON u.id = pp.user_id
       WHERE pp.plan_id = p_plan_id
         AND pp.rsvp_status = 'JOINED'::rsvp_status
         AND pp.role != 'HOST'::participant_role
    )
    UPDATE public.plan_participants pp
       SET rsvp_status = 'WAITLISTED'::rsvp_status,
           updated_at  = now()
      FROM ranked_joined rj
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rj.user_id
       AND rj.pos > GREATEST(0, p_plan_size - v_host_count);

    GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

    -- 2. Capacity increase: promote waitlisted participants if spots available (FCFS order)
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

    -- Recalculate waitlist queue positions
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_plan_size', p_plan_size,
    'plan_size', p_plan_size,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$function$;

-- ============================================================================
-- 5. MOVE_PARTICIPANT_TO_WAITLIST_AND_DECREASE_CAPACITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(p_plan_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_current_plan_size  INT;
  v_new_plan_size      INT;
  v_target_row         RECORD;
  v_next_pos           INT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
  END IF;

  SELECT plan_size
    INTO v_current_plan_size
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT assigned_group, rsvp_status, role
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
  END IF;

  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum;

  v_new_plan_size := GREATEST(1, COALESCE(v_current_plan_size, 1) - 1);

  -- Decrement plan_size only; invited_participants does NOT change
  UPDATE public.plans
     SET plan_size   = v_new_plan_size,
         updated_at  = now()
   WHERE id = p_plan_id;

  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_next_pos,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'plan_id',           p_plan_id,
    'target_user_id',    p_target_user_id,
    'new_capacity',      v_new_plan_size,
    'plan_size',         v_new_plan_size,
    'waitlist_position', v_next_pos
  );
END;
$function$;

-- ============================================================================
-- 6. INVITE_PARTICIPANTS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invite_participants(p_plan_id uuid, p_invitee_user_ids uuid[], p_assigned_group assigned_group_enum DEFAULT NULL::assigned_group_enum)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_current_plan_size INT;
  v_current_invited INT;
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

  -- 3. Fetch plan settings & filtering mode, locking row
  SELECT allow_participant_invites, participant_filtering,
         COALESCE(plan_size, 10),
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

  -- Determine effective assigned_group (NULL if AUTOMATIC)
  IF v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
  ELSE
    v_target_assigned_group := COALESCE(p_assigned_group, 'GOING'::assigned_group_enum);
  END IF;

  -- 5. Process invitees in a single atomic loop
  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if participant record already exists
      SELECT rsvp_status
        INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id
         FOR UPDATE;

      IF FOUND THEN
        IF v_existing_status = 'SKIPPED'::rsvp_status THEN
          -- Reactivation (SKIPPED -> active)
          IF v_current_plan_size = v_current_invited THEN
            v_current_plan_size := v_current_plan_size + 1;
            v_current_invited := v_current_invited + 1;
          ELSE
            v_current_invited := v_current_invited + 1;
          END IF;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 responded_at = NULL,
                 skip_reason = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        ELSE
          -- Duplicate invitation of already active participant: no-op, do NOT increment count
          CONTINUE;
        END IF;
      ELSE
        -- Genuinely new participant added
        IF v_current_plan_size = v_current_invited THEN
          v_current_plan_size := v_current_plan_size + 1;
          v_current_invited := v_current_invited + 1;
        ELSE
          v_current_invited := v_current_invited + 1;
        END IF;

        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          assigned_group,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Persist plan_size and invited_participants
  UPDATE public.plans
     SET plan_size = v_current_plan_size,
         invited_participants = v_current_invited,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'total_invited_count',  v_current_invited,
    'invited_participants', v_current_invited,
    'plan_size',            v_current_plan_size
  );
END;
$function$;

-- ============================================================================
-- 7. CLAIM_PLAN_INVITE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_plan_invite(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_plan_record              RECORD;
  v_existing_participant     RECORD;
  v_filtering                TEXT;
  v_plan_size                INT;
  v_invited_count            INT;
  v_joined_count             INT;
  v_new_plan_size            INT;
  v_new_invited              INT;
  v_was_system_op            TEXT;
  v_result_rsvp              TEXT;
  v_result_assigned_group    TEXT;
  v_result_waitlist_position INT;
  v_result_plan_size         INT;
BEGIN
  -- 1. Authentication check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Validate plan ID input
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'Invalid plan ID' USING ERRCODE = '40400';
  END IF;

  -- 3. Look up referenced plan with row lock for atomic capacity & state update
  SELECT id, status, invited_participants, plan_size, participant_filtering, waitlist_order_mode
    INTO v_plan_record
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Plan status check: link is valid ONLY while plan is LIVE
  IF v_plan_record.status <> 'LIVE'::plan_status THEN
    RAISE EXCEPTION 'Plan is not active' USING ERRCODE = '40000';
  END IF;

  -- 5. Host check: host cannot claim their own plan invite
  IF public.is_plan_host(p_plan_id, v_user_id) OR EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = v_user_id
       AND role = 'HOST'::participant_role
  ) THEN
    RAISE EXCEPTION 'Host cannot claim invite for their own plan' USING ERRCODE = '40000';
  END IF;

  -- 6. Check if caller already has a participant record
  SELECT role, rsvp_status, assigned_group, waitlist_position
    INTO v_existing_participant
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND user_id = v_user_id;

  IF FOUND THEN
    -- Idempotency: Retain existing state (JOINED, WAITLISTED, SKIPPED, INVITED)
    -- Do NOT change plan_size.
    -- Do NOT create another participant.
    -- Do NOT increase derived invited count.
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', v_plan_record.id,
      'rsvp_status', v_existing_participant.rsvp_status::text,
      'assigned_group', v_existing_participant.assigned_group::text,
      'waitlist_position', v_existing_participant.waitlist_position,
      'already_participating', true,
      'plan_size', v_plan_record.plan_size,
      'invited_participants', v_plan_record.invited_participants
    );
  END IF;

  -- 7. Derive current plan parameters and participant counts
  v_plan_size := COALESCE(v_plan_record.plan_size, 10);
  v_filtering := COALESCE(v_plan_record.participant_filtering::TEXT, 'AUTOMATIC');

  -- Count total non-skipped invited participants
  SELECT COUNT(*)
    INTO v_invited_count
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- Count current JOINED participants
  SELECT COUNT(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status = 'JOINED'::rsvp_status;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- 8. State machine execution based on plan_size vs invited_count and filtering mode
  IF v_plan_size >= v_invited_count THEN
    -- =========================================================================
    -- CASE A: plan_size == invited_count (or plan_size > invited_count)
    -- =========================================================================
    IF v_plan_size = v_invited_count THEN
      v_new_plan_size := v_plan_size + 1;
    ELSE
      v_new_plan_size := v_plan_size;
    END IF;

    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET plan_size = v_new_plan_size,
           invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    -- Insert participant as INVITED
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      responded_at,
      skip_reason,
      delivery_status
    ) VALUES (
      v_plan_record.id,
      v_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      NULL,
      NULL,
      NULL,
      NULL,
      'DELIVERED'
    );

    v_result_rsvp := 'INVITED';
    v_result_assigned_group := NULL;
    v_result_waitlist_position := NULL;
    v_result_plan_size := v_new_plan_size;

  ELSIF v_filtering = 'ASSIGNED' THEN
    -- =========================================================================
    -- CASE B: plan_size < invited_count AND participant_filtering = 'ASSIGNED'
    -- =========================================================================
    -- Do NOT increase plan_size.
    v_new_plan_size := v_plan_size;
    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    -- Create new participant as WAITLISTED with assigned_group = WAITLIST
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      waitlist_position,
      joined_queue_at,
      responded_at,
      skip_reason,
      delivery_status
    ) VALUES (
      v_plan_record.id,
      v_user_id,
      'PARTICIPANT'::participant_role,
      'WAITLISTED'::rsvp_status,
      'WAITLIST'::assigned_group_enum,
      NULL,
      NULL,
      NULL,
      NULL,
      'DELIVERED'
    );

    -- Renumber waitlist positions contiguously using existing rebuild logic
    PERFORM public.rebuild_waitlist_queue(v_plan_record.id);

    SELECT waitlist_position
      INTO v_result_waitlist_position
      FROM public.plan_participants
     WHERE plan_id = v_plan_record.id
       AND user_id = v_user_id;

    v_result_rsvp := 'WAITLISTED';
    v_result_assigned_group := 'WAITLIST';
    v_result_plan_size := v_plan_size;

  ELSE
    -- =========================================================================
    -- CASE C: plan_size < invited_count AND participant_filtering = 'AUTOMATIC'
    -- =========================================================================
    -- Do NOT increase plan_size.
    v_new_plan_size := v_plan_size;
    v_new_invited := v_invited_count + 1;

    UPDATE public.plans
       SET invited_participants = v_new_invited,
           updated_at = now()
     WHERE id = v_plan_record.id;

    IF v_joined_count < v_plan_size THEN
      -- Subcase C1: Available spot -> JOINED
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        assigned_group,
        waitlist_position,
        joined_queue_at,
        responded_at,
        skip_reason,
        delivery_status
      ) VALUES (
        v_plan_record.id,
        v_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        NULL,
        NULL,
        now(),
        now(),
        NULL,
        'DELIVERED'
      );

      v_result_rsvp := 'JOINED';
      v_result_assigned_group := NULL;
      v_result_waitlist_position := NULL;
    ELSE
      -- Subcase C2: Spots full -> WAITLISTED
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        assigned_group,
        waitlist_position,
        joined_queue_at,
        responded_at,
        skip_reason,
        delivery_status
      ) VALUES (
        v_plan_record.id,
        v_user_id,
        'PARTICIPANT'::participant_role,
        'WAITLISTED'::rsvp_status,
        NULL,
        NULL,
        now(),
        NULL,
        NULL,
        'DELIVERED'
      );

      -- Renumber waitlist positions contiguously using existing rebuild logic
      PERFORM public.rebuild_waitlist_queue(v_plan_record.id);

      SELECT waitlist_position
        INTO v_result_waitlist_position
        FROM public.plan_participants
       WHERE plan_id = v_plan_record.id
         AND user_id = v_user_id;

      v_result_rsvp := 'WAITLISTED';
      v_result_assigned_group := NULL;
    END IF;

    v_result_plan_size := v_plan_size;
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', v_result_rsvp,
    'assigned_group', v_result_assigned_group,
    'waitlist_position', v_result_waitlist_position,
    'plan_size', v_result_plan_size,
    'invited_participants', v_new_invited,
    'already_participating', false
  );
END;
$function$;

-- ============================================================================
-- 8. AUTO_PROMOTE_WAITLIST_FOR_ASSIGNED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_assigned(p_plan_id uuid, p_vacated_group assigned_group_enum)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filtering_mode   participant_filtering_type;
  v_plan_size        INT;
  v_current_going    INT;
  v_promoted_user_id UUID;
  v_promoted_count   INT := 0;
BEGIN
  -- 1. Verify plan exists and is ASSIGNED
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING, attempt promotion of WAITLIST #1
  IF p_vacated_group = 'GOING'::assigned_group_enum THEN
    IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;
         
      IF v_current_going < v_plan_size THEN
        -- Find WAITLIST #1 strictly by waitlist_position
        SELECT user_id INTO v_promoted_user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum
           AND rsvp_status = 'WAITLISTED'::rsvp_status
         ORDER BY waitlist_position ASC NULLS LAST, created_at ASC
         LIMIT 1
         FOR UPDATE;

        IF v_promoted_user_id IS NOT NULL THEN
          -- Atomically promote WAITLIST #1 to GOING and JOINED
          UPDATE public.plan_participants
             SET rsvp_status       = 'JOINED'::rsvp_status,
                 assigned_group    = 'GOING'::assigned_group_enum,
                 waitlist_position = NULL,
                 updated_at        = now()
           WHERE plan_id = p_plan_id AND user_id = v_promoted_user_id;
           
          v_promoted_count := 1;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
  WITH numbered AS (
    SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
      FROM public.plan_participants
     WHERE plan_id = p_plan_id 
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'WAITLISTED'::rsvp_status
  )
  UPDATE public.plan_participants pp
     SET waitlist_position = n.new_pos,
         updated_at        = CASE WHEN pp.waitlist_position IS DISTINCT FROM n.new_pos THEN now() ELSE pp.updated_at END
    FROM numbered n
   WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

  RETURN v_promoted_count;
END;
$function$;

-- ============================================================================
-- 9. AUTO_PROMOTE_WAITLIST_FOR_AUTOMATIC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(p_plan_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filtering      TEXT;
  v_plan_size      INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
  v_was_system_op  TEXT;
BEGIN
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode and plan_size (join capacity)
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'),
         plan_size
    INTO v_filtering, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  -- Do NOT auto-promote on ASSIGNED plans or if plan_size is missing/invalid
  IF NOT FOUND OR v_filtering = 'ASSIGNED' OR v_plan_size IS NULL OR v_plan_size <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_plan_size - v_joined_count;

  IF v_available <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Promote waitlisted participants in FCFS queue order (joined_queue_at ASC, alphabetical name fallback)
  FOR v_rec IN
    SELECT pp.user_id, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id AND pp.rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY pp.joined_queue_at ASC NULLS LAST,
              COALESCE(u.full_name, u.username, '') ASC
     LIMIT v_available
  LOOP
    UPDATE public.plan_participants
       SET rsvp_status       = 'JOINED'::rsvp_status,
           skip_reason       = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
           waitlist_position = NULL,
           assigned_group    = NULL,
           responded_at      = now(),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

    v_promoted := v_promoted + 1;
  END LOOP;
  
  -- Recalculate remaining waitlist positions if any promotions occurred
  IF v_promoted > 0 THEN
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN v_promoted;
END;
$function$;

-- ============================================================================
-- 10. SWITCH_TO_AUTOMATIC_WAITLIST_MODE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.switch_to_automatic_waitlist_mode(p_plan_id uuid, p_promoted_user_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_filtering_mode           participant_filtering_type;
  v_plan_size                INT;
  v_going_count              INT;
  v_vacant_spots             INT;
  v_promoted_count           INT;
  v_valid_promoted_count     INT;
BEGIN
  -- 1. Lock and fetch target plan settings
  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 2. Verify plan is currently in ASSIGNED filtering mode
  IF v_filtering_mode <> 'ASSIGNED'::participant_filtering_type THEN
    RAISE EXCEPTION 'Plan is not in ASSIGNED waitlist mode' USING ERRCODE = '40000';
  END IF;

  -- 3. Calculate current GOING count and vacant spots using plan_size
  SELECT COUNT(*) INTO v_going_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'GOING'::assigned_group_enum;

  v_vacant_spots := GREATEST(0, COALESCE(v_plan_size, 0) - v_going_count);
  v_promoted_count := COALESCE(array_length(p_promoted_user_ids, 1), 0);

  -- 4. Validation when vacant spots exist
  IF v_vacant_spots > 0 THEN
    IF v_promoted_count <> v_vacant_spots THEN
      RAISE EXCEPTION 'Must select exactly % participants to fill available GOING spots (received %)', 
        v_vacant_spots, v_promoted_count USING ERRCODE = '40001';
    END IF;

    -- Validate that all selected user IDs exist in WAITLIST group with rsvp_status = 'JOINED'
    SELECT COUNT(*) INTO v_valid_promoted_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids)
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_valid_promoted_count <> v_promoted_count THEN
      RAISE EXCEPTION 'One or more selected participants are not eligible for promotion (must be WAITLIST + JOINED)'
        USING ERRCODE = '40002';
    END IF;

    -- Promote selected participants to GOING and clear waitlist_position
    UPDATE public.plan_participants
       SET assigned_group = 'GOING'::assigned_group_enum,
           waitlist_position = NULL,
           updated_at = now()
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids);
  END IF;

  -- 5. Switch plan participant_filtering to AUTOMATIC
  UPDATE public.plans
     SET participant_filtering = 'AUTOMATIC'::participant_filtering_type
   WHERE id = p_plan_id;

END;
$function$;

-- ============================================================================
-- 11. MOVE_WAITLIST_TO_GOING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.move_waitlist_to_going(p_plan_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id          UUID;
  v_plan_size          INT;
  v_total_cost         NUMERIC;
  v_target_status      rsvp_status;
  v_joined_count       INT := 0;
  v_active_count       INT := 0;
  v_new_cost           NUMERIC;
  v_filtering          TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only hosts can move waitlisted participants into Going' USING ERRCODE = '40300';
  END IF;

  SELECT plan_size, total_cost,
         COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_plan_size, v_total_cost, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_filtering <> 'ASSIGNED' THEN
    RAISE EXCEPTION 'Manual queue movement is not allowed on Automatic plans'
      USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status = 'JOINED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_joined', true
    );
  END IF;

  IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_joined_count >= v_plan_size THEN
      RAISE EXCEPTION 'Going list is already full (% / %)', v_joined_count, v_plan_size
        USING ERRCODE = '40900';
    END IF;
  END IF;

  UPDATE public.plan_participants
     SET rsvp_status  = 'JOINED'::rsvp_status,
         skip_reason  = NULL,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

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
$function$;

-- ============================================================================
-- 12. LEAVE_PLAN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.leave_plan(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id                  UUID;
  v_plan_size                INT;
  v_total_cost               NUMERIC;
  v_current_role             participant_role;
  v_current_rsvp             rsvp_status;
  v_vacated_group            assigned_group_enum;
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_remaining_hosts          INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT plan_size, total_cost, participant_filtering
    INTO v_plan_size, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role, rsvp_status, assigned_group
    INTO v_current_role, v_current_rsvp, v_vacated_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- Last-host protection: Host cannot leave if they are the sole active host
  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot leave the plan as the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  UPDATE public.plan_participants
     SET role              = 'PARTICIPANT'::participant_role,
         rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'LEFT'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_vacated_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_vacated_group);
      END IF;
    END IF;
  END IF;

  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
    ELSE
      v_new_cost_per_participant := NULL;
    END IF;

    UPDATE public.plan_participants
       SET cost_per_participant = v_new_cost_per_participant,
           updated_at           = now()
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   NULL,
    'promoted_count',     v_promoted_count
  );
END;
$function$;

-- ============================================================================
-- 13. REMOVE_PARTICIPANT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.remove_participant(p_plan_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_plan_size              INT;
  v_promoted_count         INT := 0;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering, plan_size
    INTO v_filtering_mode, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status, assigned_group, COALESCE(leave_requested, FALSE)
    INTO v_target_role, v_target_status, v_target_assigned_group, v_target_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot remove the last active host
  IF v_target_role = 'HOST'::participant_role AND v_target_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Determine skip_reason:
  IF v_target_leave_requested = TRUE THEN
    v_skip_reason := 'LEFT'::skip_reason;
  ELSE
    v_skip_reason := 'REMOVED'::skip_reason;
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant:
  IF v_target_status = 'INVITED'::rsvp_status THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  ELSE
    UPDATE public.plan_participants
       SET rsvp_status       = 'SKIPPED'::rsvp_status,
           skip_reason       = v_skip_reason,
           assigned_group    = NULL,
           waitlist_position = NULL,
           role              = 'PARTICIPANT'::participant_role,
           leave_requested   = FALSE,
           leave_requested_at= NULL,
           responded_at      = now(),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  END IF;

  -- Trigger appropriate waitlist promotion path using plan_size
  IF v_plan_size IS NOT NULL THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      IF v_target_status = 'JOINED'::rsvp_status THEN
        v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
      END IF;
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'skip_reason',      CASE WHEN v_target_status = 'INVITED'::rsvp_status THEN NULL ELSE v_skip_reason END,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$function$;

-- ============================================================================
-- 14. COST CALCULATIONS
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
  SELECT total_cost, plan_size
  INTO v_total_cost, v_plan_size
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

CREATE OR REPLACE FUNCTION public.set_participant_cost_share_on_join()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_total_cost NUMERIC(10,2);
  v_plan_size INT;
BEGIN
  IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT total_cost, plan_size
      INTO v_total_cost, v_plan_size
      FROM public.plans
     WHERE id = NEW.plan_id;

    IF v_total_cost IS NOT NULL AND v_total_cost > 0 AND v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
      NEW.cost_per_participant := ROUND(v_total_cost / v_plan_size, 2);
    ELSE
      NEW.cost_per_participant := 0;
    END IF;
  ELSE
    NEW.cost_per_participant := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- 15. MANAGE_COMPLETED_PLAN_PARTICIPANTS & RESOLVE_PAID_PLAN_LEAVE_REQUEST
-- ============================================================================

CREATE OR REPLACE FUNCTION public.manage_completed_plan_participants(p_plan_id uuid, p_users_to_add uuid[] DEFAULT '{}'::uuid[], p_users_to_remove uuid[] DEFAULT '{}'::uuid[], p_expense_mode text DEFAULT 'NONE'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_target_user_id UUID;
  v_initial_attendee_count INT;
  v_final_count INT;
  v_participant RECORD;
  v_plan_expense RECORD;
  v_initial_total_cost NUMERIC;
  v_initial_share NUMERIC;
  v_share NUMERIC;
  v_new_total_cost NUMERIC;
  v_final_invited INT;
  v_remaining_hosts INT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, total_cost, scheduled_at
  INTO v_plan_status, v_initial_total_cost, v_scheduled_at
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active host
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
  ) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 2b. Enforce 24-hour participant management window from scheduled_at
  IF v_scheduled_at IS NOT NULL AND now() >= (v_scheduled_at + INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'This plan can no longer be managed because the 24-hour participant management window has expired.' USING ERRCODE = '40000';
  END IF;

  -- 3. Capture Initial State BEFORE participant mutations
  SELECT count(*) INTO v_initial_attendee_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT * INTO v_plan_expense
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id
    AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_plan_expense.id IS NOT NULL THEN
    SELECT amount_owed INTO v_initial_share
    FROM public.wallet_expense_participants
    WHERE expense_id = v_plan_expense.id AND amount_owed > 0
    ORDER BY amount_owed DESC
    LIMIT 1;

    IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
      IF v_initial_attendee_count > 0 THEN
        v_initial_share := ROUND((v_plan_expense.total_amount / v_initial_attendee_count)::numeric, 2);
      ELSE
        v_initial_share := 0;
      END IF;
    END IF;
  ELSE
    v_initial_share := 0;
  END IF;

  -- 4. Process Additions
  IF p_users_to_add IS NOT NULL AND array_length(p_users_to_add, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_add LOOP
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        final_attendance,
        final_state,
        skip_reason,
        created_at,
        updated_at
      )
      VALUES (
        p_plan_id,
        v_target_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        'ATTENDED'::attendance_status,
        'JOINED'::rsvp_status,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE SET
        rsvp_status = 'JOINED'::rsvp_status,
        final_attendance = 'ATTENDED'::attendance_status,
        final_state = 'JOINED'::rsvp_status,
        skip_reason = NULL,
        updated_at = now();
    END LOOP;
  END IF;

  -- 5. Process Removals
  IF p_users_to_remove IS NOT NULL AND array_length(p_users_to_remove, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove LOOP
      -- Last-host check for removal
      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id AND role = 'HOST'::participant_role
      ) THEN
        SELECT COUNT(*) INTO v_remaining_hosts
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND user_id <> v_target_user_id AND user_id <> ALL(p_users_to_remove);

        IF v_remaining_hosts < 1 THEN
          -- Prevent removing the last remaining host
          CONTINUE;
        END IF;
      END IF;

      UPDATE public.plan_participants
      SET
        rsvp_status = 'SKIPPED'::rsvp_status,
        final_attendance = 'DID_NOT_ATTEND'::attendance_status,
        final_state = 'SKIPPED'::rsvp_status,
        updated_at = now()
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
    END LOOP;
  END IF;

  -- 6. Authoritative Final Attendance & Capacity Calculation
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT count(*) INTO v_final_invited
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- 7. Expense Mode Recalculation
  IF v_plan_expense.id IS NOT NULL THEN
    IF p_expense_mode = 'KEEP_CURRENT_COST' THEN
      v_share := v_initial_share;
      v_new_total_cost := v_share * v_final_count;
    ELSIF p_expense_mode = 'SPLIT_ALL' THEN
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    ELSE
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    END IF;

    UPDATE public.wallet_expenses
    SET total_amount = v_new_total_cost, updated_at = now()
    WHERE id = v_plan_expense.id;

    -- Re-allocate per-person shares for ATTENDED members
    FOR v_participant IN
      SELECT pp.user_id, wep.id as wallet_part_id, wep.status as wallet_part_status, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.wallet_expense_participants wep
        ON wep.expense_id = v_plan_expense.id AND wep.user_id = pp.user_id
      WHERE pp.plan_id = p_plan_id
    LOOP
      IF v_participant.skip_reason = 'PAYMENT_KEPT' THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_participant.user_id AND final_attendance = 'ATTENDED'::attendance_status
      ) THEN
        IF v_participant.wallet_part_id IS NOT NULL THEN
          IF v_participant.wallet_part_status != 'SETTLED' THEN
            UPDATE public.wallet_expense_participants
            SET amount_owed = v_share, updated_at = now()
            WHERE id = v_participant.wallet_part_id;
          END IF;
        ELSE
          INSERT INTO public.wallet_expense_participants (
            expense_id,
            user_id,
            amount_owed,
            amount_paid,
            status,
            created_at,
            updated_at
          )
          VALUES (
            v_plan_expense.id,
            v_participant.user_id,
            v_share,
            0,
            'PENDING',
            now(),
            now()
          );
        END IF;
      ELSE
        IF v_participant.wallet_part_id IS NOT NULL AND v_participant.wallet_part_status != 'SETTLED' THEN
          DELETE FROM public.wallet_expense_participants WHERE id = v_participant.wallet_part_id;
        END IF;
      END IF;
    END LOOP;
  ELSE
    v_new_total_cost := v_initial_total_cost;
  END IF;

  -- 8. Update plan totals & counts
  UPDATE public.plans
  SET
    attended_participants = v_final_count,
    invited_participants = v_final_invited,
    total_cost = coalesce(v_new_total_cost, total_cost),
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'invited_participants', v_final_invited,
    'attended_participants', v_final_count,
    'total_cost', coalesce(v_new_total_cost, v_initial_total_cost),
    'final_count', v_final_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_paid_plan_leave_request(p_plan_id uuid, p_target_user_id uuid, p_resolution text, p_replacement_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id                  UUID;
  v_filtering_mode             participant_filtering_type;
  v_target_rsvp                rsvp_status;
  v_target_leave_req           BOOLEAN;
  v_target_assigned_group      assigned_group_enum;
  v_expense_id                 UUID;
  v_replacement_rsvp           rsvp_status;
  v_replacement_assigned_group assigned_group_enum;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization check: Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type)
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_resolution NOT IN ('REPLACED', 'KEEP_PAYMENT') THEN
    RAISE EXCEPTION 'Invalid resolution type. Must be REPLACED or KEEP_PAYMENT' USING ERRCODE = '40000';
  END IF;

  -- 2. Lock & fetch target participant details
  SELECT rsvp_status, leave_requested, assigned_group
    INTO v_target_rsvp, v_target_leave_req, v_target_assigned_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  -- 3. Transition target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'REPLACED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    SELECT id INTO v_expense_id
      FROM public.wallet_expenses
     WHERE plan_id = p_plan_id AND message_id IS NULL
     LIMIT 1;

    IF v_expense_id IS NOT NULL THEN
      DELETE FROM public.wallet_expense_participants
       WHERE expense_id = v_expense_id
         AND user_id = p_target_user_id
         AND status != 'SETTLED'::wallet_expense_status;
    END IF;

  ELSIF p_resolution = 'KEEP_PAYMENT' THEN
    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'PAYMENT_KEPT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    ELSIF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      PERFORM public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  -- 4. Handle replacement participant if REPLACED
  IF p_replacement_user_id IS NOT NULL AND p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status, assigned_group INTO v_replacement_rsvp, v_replacement_assigned_group
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF FOUND AND (v_replacement_assigned_group = 'GOING'::assigned_group_enum OR (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_rsvp = 'JOINED'::rsvp_status)) THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      -- Replacement is not yet in plan -> invite them as JOINED
      INSERT INTO public.plan_participants (
        plan_id, user_id, role, rsvp_status, assigned_group, waitlist_position, responded_at
      ) VALUES (
        p_plan_id,
        p_replacement_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
        NULL,
        now()
      );
    ELSE
      -- Replacement is already a participant (e.g. on waitlist) -> promote them to JOINED
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
             waitlist_position = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

      IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
        PERFORM public.recalculate_automatic_waitlist_positions(p_plan_id);
      ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        PERFORM public.recalculate_assigned_waitlist_positions(p_plan_id);
      END IF;
    END IF;

    -- Add replacement to wallet expense if exists
    IF v_expense_id IS NOT NULL THEN
      INSERT INTO public.wallet_expense_participants (expense_id, user_id, status)
      VALUES (v_expense_id, p_replacement_user_id, 'PENDING'::wallet_expense_status)
      ON CONFLICT (expense_id, user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'target_user_id', p_target_user_id,
    'resolution', p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$function$;
