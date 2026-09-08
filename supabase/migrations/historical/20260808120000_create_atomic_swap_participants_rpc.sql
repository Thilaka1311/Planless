-- ============================================================
-- Migration: Atomic participant swap RPC
-- Creates a PostgreSQL function that atomically swaps a GOING
-- participant to WAITLIST and a WAITLIST participant to GOING in
-- a single transaction, bypassing the unique waitlist_position
-- constraint via a DEFERRED or sequential strategy.
-- ============================================================

CREATE OR REPLACE FUNCTION public.swap_plan_participants(
  p_plan_id        UUID,
  p_going_user_id  UUID,
  p_waitlist_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id      UUID;
  v_caller_role    participant_role;
  v_going_row      RECORD;
  v_waitlist_row   RECORD;
  v_new_waitlist_pos INT;
BEGIN
  -- 1. Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller is HOST of this plan
  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Unauthorized: only the host can swap participants' USING ERRCODE = '40300';
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
  --    (one past the current max, avoiding collisions)
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_new_waitlist_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'
     AND user_id != p_waitlist_user_id;  -- exclude the one we're promoting

  -- 5a. First clear the waitlist participant's position to avoid unique collision
  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_waitlist_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
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

  RETURN jsonb_build_object(
    'success',          true,
    'going_user_id',    p_going_user_id,
    'waitlist_user_id', p_waitlist_user_id,
    'new_waitlist_pos', v_new_waitlist_pos
  );
END;
$$;

-- Grant execution to authenticated users (auth check inside)
GRANT EXECUTE ON FUNCTION public.swap_plan_participants(UUID, UUID, UUID) TO authenticated;
