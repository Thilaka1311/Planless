-- ============================================================================
-- Migration: Create move_waitlist_to_going SECURITY DEFINER RPC function & update RLS
-- Description: Allows Creator Host or Additional Hosts to move any waitlisted
--              participant into an open Going spot. Validates capacity and roles.
-- ============================================================================

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
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch plan attributes
  SELECT host_id, max_participants, total_cost
    INTO v_creator_id, v_max_participants, v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
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

-- Update RLS policy on plan_participants to allow Additional Hosts to manage participant statuses
DROP POLICY IF EXISTS "Allow users to update participant status" ON public.plan_participants;

CREATE POLICY "Allow users to update participant status" 
ON public.plan_participants 
FOR UPDATE 
TO authenticated 
USING (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.plan_participants cohost
    WHERE cohost.plan_id = plan_participants.plan_id 
      AND cohost.user_id = auth.uid()
      AND cohost.role IN ('HOST'::participant_role, 'CO_HOST'::participant_role)
      AND cohost.rsvp_status = 'JOINED'::rsvp_status
  )
)
WITH CHECK (
  auth.uid() = user_id OR 
  EXISTS (
    SELECT 1 FROM public.plans 
    WHERE plans.id = plan_id AND plans.host_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.plan_participants cohost
    WHERE cohost.plan_id = plan_participants.plan_id 
      AND cohost.user_id = auth.uid()
      AND cohost.role IN ('HOST'::participant_role, 'CO_HOST'::participant_role)
      AND cohost.rsvp_status = 'JOINED'::rsvp_status
  )
);
