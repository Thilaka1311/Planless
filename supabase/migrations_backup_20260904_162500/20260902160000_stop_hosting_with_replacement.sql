-- Migration: 20260902160000_stop_hosting_with_replacement.sql
-- Description: Create stop_hosting_with_replacement SECURITY DEFINER RPC
-- Provides atomic host replacement when the last remaining active host wants to stop hosting
-- without leaving the plan or creating a leave request.

CREATE OR REPLACE FUNCTION public.stop_hosting_with_replacement(
  p_plan_id uuid,
  p_replacement_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization: Caller must be an active HOST (role = 'HOST', rsvp_status = 'JOINED')
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may perform stop hosting replacement' USING ERRCODE = '40300';
  END IF;

  -- 2. Cannot replace host with self
  IF p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot replace host with self' USING ERRCODE = '40000';
  END IF;

  -- 3. Validate replacement candidate: must be member, role = 'PARTICIPANT', rsvp_status = 'JOINED'
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 4. Promote replacement participant to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_replacement_user_id;

  -- 5. Demote caller to PARTICIPANT (maintaining JOINED status, NO leave request)
  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = v_caller_id;

  -- 6. Log host promotion activity
  BEGIN
    INSERT INTO public.plan_activity (
      plan_id,
      user_id,
      activity_type,
      metadata,
      created_at
    ) VALUES (
      p_plan_id,
      v_caller_id,
      'host_promoted'::plan_activity_type,
      jsonb_build_object(
        'promoted_user_id', p_replacement_user_id,
        'action', 'stop_hosting_replacement'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Non-blocking activity logging
  END;

  RETURN jsonb_build_object(
    'success',                  true,
    'plan_id',                  p_plan_id,
    'new_host_id',              p_replacement_user_id,
    'demoted_caller_id',        v_caller_id,
    'caller_role',              'PARTICIPANT',
    'caller_status',            'JOINED'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.stop_hosting_with_replacement(UUID, UUID) TO authenticated;
