-- ============================================================================
-- Migration: Unify Host Permissions across RLS and RPCs
-- Description: Standardizes all host operations so any user with role IN ('HOST', 'CO_HOST')
--              and JOINED status has equal permissions for cancelling plans,
--              removing participants, updating capacity, and deleting plans.
--              Removes all Creator Host special protections.
-- ============================================================================

-- 1. Update cancel_plan RPC
CREATE OR REPLACE FUNCTION public.cancel_plan(
  p_plan_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id       UUID;
  v_creator_id    UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_is_host       BOOLEAN := FALSE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id
    INTO v_creator_id
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_user_id = v_creator_id THEN
    v_is_host := TRUE;
  ELSE
    SELECT role, rsvp_status
      INTO v_caller_role, v_caller_status
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = v_user_id;

    IF FOUND AND v_caller_status = 'JOINED'::rsvp_status AND v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
      v_is_host := TRUE;
    END IF;
  END IF;

  IF NOT v_is_host THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may cancel the plan' USING ERRCODE = '40300';
  END IF;

  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_plan(UUID) TO authenticated;


-- 2. Update remove_participant RPC to allow removing any participant without creator exceptions
CREATE OR REPLACE FUNCTION public.remove_participant(
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
  v_target_status      rsvp_status;
  v_filtering_mode     participant_filtering_type;
  v_joined_count       INT := 0;
  v_max_participants   INT;
  v_promoted_user_id   UUID := NULL;
  v_waitlist_rec       RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, max_participants, participant_filtering
    INTO v_creator_id, v_max_participants, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

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
    RAISE EXCEPTION 'Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_removed', true
    );
  END IF;

  UPDATE public.plan_participants
     SET rsvp_status  = 'SKIPPED'::rsvp_status,
         skip_reason  = 'REMOVED',
         role         = 'PARTICIPANT'::participant_role,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  IF v_filtering_mode = 'AUTOMATIC' AND v_target_status = 'JOINED'::rsvp_status THEN
    PERFORM set_config('app.system_op', 'true', true);

    SELECT user_id
      INTO v_waitlist_rec
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY created_at ASC
     LIMIT 1;

    IF FOUND THEN
      v_promoted_user_id := v_waitlist_rec.user_id;

      UPDATE public.plan_participants
         SET rsvp_status  = 'JOINED'::rsvp_status,
             responded_at = now(),
             updated_at   = now()
       WHERE plan_id = p_plan_id
         AND user_id  = v_promoted_user_id;
    END IF;

    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'removed_user_id',  p_target_user_id,
    'promoted_user_id', v_promoted_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_participant(UUID, UUID) TO authenticated;


-- 3. Update plans DELETE policy so any joined host can delete plans
DROP POLICY IF EXISTS "Allow hosts to delete plans" ON public.plans;

CREATE POLICY "Allow hosts to delete plans" 
ON public.plans 
FOR DELETE 
TO authenticated 
USING (
  auth.uid() = host_id 
  OR EXISTS (
    SELECT 1 
      FROM public.plan_participants pp 
     WHERE pp.plan_id = public.plans.id 
       AND pp.user_id = auth.uid() 
       AND pp.role IN ('HOST'::participant_role, 'CO_HOST'::participant_role)
       AND pp.rsvp_status = 'JOINED'::rsvp_status
  )
);
