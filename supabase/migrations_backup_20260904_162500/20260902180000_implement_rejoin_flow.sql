-- ============================================================
-- Migration: Implement Rejoin Flow for Skipped Participants
-- 1. Add REJOINED to rsvp_status enum
-- 2. Create rejoin_plan RPC (called by skipped participant)
-- 3. Create resolve_rejoined_participant RPC (called by active host)
-- 4. Update swap_plan_participants RPC to support REJOINED
-- ============================================================

-- 1. Add REJOINED to rsvp_status enum
ALTER TYPE public.rsvp_status ADD VALUE IF NOT EXISTS 'REJOINED';

-- 2. Create rejoin_plan RPC (called by skipped participant)
CREATE OR REPLACE FUNCTION public.rejoin_plan(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id UUID;
  v_participant RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT * INTO v_participant
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant record not found' USING ERRCODE = '40400';
  END IF;

  IF v_participant.rsvp_status <> 'SKIPPED'::rsvp_status THEN
    RAISE EXCEPTION 'Only skipped participants can request to rejoin' USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.plan_participants
     SET rsvp_status       = 'REJOINED'::rsvp_status,
         skip_reason       = NULL,
         leave_requested   = FALSE,
         leave_requested_at= NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_caller_id,
    'status',  'REJOINED'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rejoin_plan(UUID) TO authenticated;

-- 3. Create resolve_rejoined_participant RPC (called by active host)
CREATE OR REPLACE FUNCTION public.resolve_rejoined_participant(
  p_plan_id uuid,
  p_target_user_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id             UUID;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
  v_filtering_mode        participant_filtering_type;
  v_max_pos               INT;
  v_decision              TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts can resolve rejoin requests' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  IF v_target_status <> 'REJOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Participant is not in REJOINED status' USING ERRCODE = '40000';
  END IF;

  v_decision := UPPER(TRIM(p_decision));

  PERFORM set_config('app.system_op', 'true', true);

  IF v_decision = 'JOINED' THEN
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = 'GOING'::assigned_group_enum,
             waitlist_position = NULL,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    ELSE
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'WAITLIST' OR v_decision = 'WAITLISTED' THEN
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      SELECT COALESCE(MAX(waitlist_position), 0)
        INTO v_max_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND user_id <> p_target_user_id;

      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = 'WAITLIST'::assigned_group_enum,
             waitlist_position = v_max_pos + 1,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    ELSE
      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             joined_queue_at   = now(),
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'REMOVE' THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  ELSE
    PERFORM set_config('app.system_op', 'false', true);
    RAISE EXCEPTION 'Invalid decision: % (must be JOINED, WAITLISTED, or REMOVE)', p_decision USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',  true,
    'plan_id',  p_plan_id,
    'user_id',  p_target_user_id,
    'decision', v_decision
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_rejoined_participant(UUID, UUID, TEXT) TO authenticated;

-- 4. Update swap_plan_participants to support REJOINED
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

  -- 4. Compute a safe new waitlist position for the GOING→WAITLIST participant
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_new_waitlist_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum
     AND user_id <> p_waitlist_user_id;

  PERFORM set_config('app.system_op', 'true', true);

  -- 5a. First clear the waitlist participant's position to avoid unique collision and promote to GOING
  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_waitlist_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                               WHEN v_waitlist_row.rsvp_status = 'REJOINED'::rsvp_status THEN 'JOINED'::rsvp_status
                               ELSE v_waitlist_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_waitlist_user_id;

  -- 5b. Then move the going participant to the waitlist
  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_new_waitlist_pos,
         rsvp_status       = CASE
                               WHEN v_going_row.rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE v_going_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_going_user_id;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'going_user_id',    p_going_user_id,
    'waitlist_user_id', p_waitlist_user_id,
    'new_waitlist_pos', v_new_waitlist_pos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.swap_plan_participants(UUID, UUID, UUID) TO authenticated;
