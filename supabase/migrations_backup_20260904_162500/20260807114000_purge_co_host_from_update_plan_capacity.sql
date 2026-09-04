-- Migration: Purge remaining CO_HOST references from update_plan_capacity and other RPC functions
-- Description: Ensures update_plan_capacity checks v_caller_role = 'HOST'::participant_role

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

  IF v_filtering = 'ASSIGNED' THEN
    -- Assigned mode capacity reduction:
    -- Displace newest non-host participants assigned to GOING (assigned_group = 'GOING')
    -- into WAITLIST (assigned_group = 'WAITLIST').
    -- If RSVP was JOINED, update to WAITLISTED. If RSVP was INVITED, preserve INVITED.
    UPDATE public.plan_participants
       SET assigned_group = 'WAITLIST'::assigned_group_enum,
           rsvp_status    = CASE WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status ELSE rsvp_status END,
           updated_at     = now()
     WHERE (plan_id, user_id) IN (
       SELECT plan_id, user_id
         FROM public.plan_participants
        WHERE plan_id = p_plan_id
          AND role = 'PARTICIPANT'::participant_role
          AND assigned_group = 'GOING'::assigned_group_enum
        ORDER BY responded_at DESC NULLS LAST, created_at DESC
        OFFSET GREATEST(0, p_max_participants - (
          SELECT COUNT(*)
            FROM public.plan_participants
           WHERE plan_id = p_plan_id
             AND role = 'HOST'::participant_role
        ))
     );

    -- Assigned mode capacity increase:
    -- Promote top waitlisted participants (assigned_group = 'WAITLIST') into GOING (assigned_group = 'GOING').
    -- If RSVP was WAITLISTED, update to JOINED. If RSVP was INVITED, preserve INVITED.
    WITH promoted AS (
      UPDATE public.plan_participants
         SET assigned_group    = 'GOING'::assigned_group_enum,
             rsvp_status       = CASE WHEN rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status ELSE rsvp_status END,
             waitlist_position = NULL,
             updated_at        = now()
       WHERE (plan_id, user_id) IN (
         SELECT plan_id, user_id
           FROM public.plan_participants
          WHERE plan_id = p_plan_id
            AND assigned_group = 'WAITLIST'::assigned_group_enum
          ORDER BY waitlist_position ASC NULLS LAST, created_at ASC
          LIMIT GREATEST(0, p_max_participants - (
            SELECT COUNT(*)
              FROM public.plan_participants
             WHERE plan_id = p_plan_id
               AND assigned_group = 'GOING'::assigned_group_enum
          ))
       )
       RETURNING 1
    )
    SELECT COUNT(*) INTO v_promoted_count FROM promoted;
  ELSE
    -- Automatic mode capacity increase: promote top waitlisted participants if spots available
    SELECT COUNT(*) INTO v_promoted_count
      FROM public.auto_promote_waitlist_for_automatic(p_plan_id);
  END IF;

  -- Log capacity_changed business event
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
  VALUES (
    p_plan_id,
    v_user_id,
    NULL,
    'capacity_changed'::plan_activity_type,
    jsonb_build_object('new_capacity', p_max_participants, 'promoted_count', v_promoted_count)
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_capacity', p_max_participants,
    'promoted_count', v_promoted_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_plan_capacity(UUID, INT) TO authenticated;
