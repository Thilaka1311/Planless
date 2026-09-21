-- Migration: Preserve exact waitlist position on Assigned participant swap
-- When a Joined participant is swapped with a Waitlisted participant, the participant
-- moved from Joined -> Waitlist inherits the exact waitlist_position of the participant
-- moving from Waitlist -> Joined.

CREATE OR REPLACE FUNCTION "public"."swap_plan_participants"(
  "p_plan_id" "uuid",
  "p_going_user_id" "uuid",
  "p_waitlist_user_id" "uuid"
) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id        UUID;
  v_going_row        RECORD;
  v_waitlist_row     RECORD;
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

  -- 4. Preserve the exact waitlist position of the participant moving from Waitlist -> Joined
  v_new_waitlist_pos := v_waitlist_row.waitlist_position;
  IF v_new_waitlist_pos IS NULL THEN
    SELECT COALESCE(MAX(waitlist_position), 0) + 1
      INTO v_new_waitlist_pos
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND user_id <> p_waitlist_user_id;
  END IF;

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

  -- 5b. Then move the going participant to the waitlist inheriting the exact waitlist position
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
GRANT EXECUTE ON FUNCTION public.swap_plan_participants(UUID, UUID, UUID) TO service_role;
