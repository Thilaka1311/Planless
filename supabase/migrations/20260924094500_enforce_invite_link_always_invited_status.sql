-- Migration: 20260924094500_enforce_invite_link_always_invited_status.sql
-- Description: Enforce that claiming an invite link always creates new participants with RSVP status = 'INVITED',
--              regardless of Plan type or participant mode (Automatic, Assigned, etc.).
--              If a participant row already exists, preserve their existing RSVP status untouched.

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
  v_plan_size                INT;
  v_invited_count            INT;
  v_new_plan_size            INT;
  v_new_invited              INT;
  v_was_system_op            TEXT;
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

  -- 3. Look up referenced plan with row lock
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

  -- 5. Host check: host cannot claim invite for their own plan
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

  IF v_existing_participant.role IS NOT NULL THEN
    -- Idempotency: Retain existing state (JOINED, WAITLISTED, SKIPPED, INVITED)
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

  -- 7. New participant row creation:
  -- When someone opens an invite link without an existing row, their RSVP status
  -- must ALWAYS be 'INVITED' regardless of plan type or participant mode.
  v_plan_size := COALESCE(v_plan_record.plan_size, 10);

  -- Count total non-skipped invited participants
  SELECT COUNT(*)
    INTO v_invited_count
    FROM public.plan_participants
   WHERE plan_id = v_plan_record.id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- Only increase Plan size if: invited participants === current Plan size
  IF v_invited_count = v_plan_size THEN
    v_new_plan_size := v_plan_size + 1;
  ELSE
    v_new_plan_size := v_plan_size;
  END IF;

  v_new_invited := v_invited_count + 1;

  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.plans
     SET plan_size = v_new_plan_size,
         invited_participants = v_new_invited,
         updated_at = now()
   WHERE id = v_plan_record.id;

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
    'INVITED'::rsvp_status,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'DELIVERED'
  );

  IF v_was_system_op IS NULL OR v_was_system_op = '' THEN
    PERFORM set_config('app.system_op', 'false', true);
  ELSE
    PERFORM set_config('app.system_op', v_was_system_op, true);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_record.id,
    'rsvp_status', 'INVITED',
    'assigned_group', NULL,
    'waitlist_position', NULL,
    'already_participating', false,
    'plan_size', v_new_plan_size,
    'invited_participants', v_new_invited
  );
END;
$function$;
