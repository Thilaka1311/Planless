-- Migration: 20260828103000_fix_update_plan_capacity_remove_obsolete_activity.sql
-- Description: Fix update_plan_capacity SECURITY DEFINER RPC function to remove obsolete 'capacity_changed' activity insertion, while preserving all capacity management logic and automatic participant activity logging via database triggers.

CREATE OR REPLACE FUNCTION public.update_plan_capacity(
  p_plan_id UUID,
  p_max_participants INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  IF v_user_id = v_creator_id OR v_caller_role = 'HOST'::participant_role THEN
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

  IF v_filtering != 'ASSIGNED' THEN
    -- Automatic mode capacity increase: promote top waitlisted participants if spots available
    -- Note: auto_promote_waitlist_for_automatic updates plan_participants rsvp_status to JOINED,
    -- which triggers log_plan_participant_activity to record participant movement automatically.
    SELECT COUNT(*) INTO v_promoted_count
      FROM public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  -- Obsolete capacity_changed activity insertion removed per Plan Activity redesign.
  -- Capacity changes themselves do not create a timeline activity.

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_capacity', p_max_participants,
    'promoted_count', v_promoted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
