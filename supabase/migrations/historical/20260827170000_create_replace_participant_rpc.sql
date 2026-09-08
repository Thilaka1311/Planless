-- Migration: Create Security Definer RPC public.replace_participant
-- Description: Allows plan host to replace a participant without requiring an active leave request.

CREATE OR REPLACE FUNCTION public.replace_participant(
  p_plan_id UUID,
  p_target_user_id UUID,
  p_replacement_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id          UUID;
  v_host_id            UUID;
  v_target_row         RECORD;
  v_replacement_row    RECORD;
  v_target_was_going   BOOLEAN := FALSE;
  v_replacement_prev_pos INT := NULL;
  v_filtering_mode     participant_filtering_type;
BEGIN
  -- 1. Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan & host authorization
  SELECT host_id, participant_filtering
    INTO v_host_id, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
    ) THEN
      RAISE EXCEPTION 'Only the plan host can replace participants' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- 3. Lock target participant row
  SELECT assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  v_target_was_going := (v_target_row.assigned_group = 'GOING'::assigned_group_enum);

  -- 4. Check if replacement participant is already in plan_participants
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
   FOR UPDATE;

  -- 5. Transition target participant to SKIPPED / REPLACED
  UPDATE public.plan_participants
     SET rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'REPLACED'::skip_reason,
         assigned_group     = NULL,
         waitlist_position = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- 6. Transition or Insert replacement participant
  IF FOUND THEN
    v_replacement_prev_pos := v_replacement_row.waitlist_position;

    UPDATE public.plan_participants
       SET assigned_group    = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
           waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
           rsvp_status       = CASE
                                 WHEN v_replacement_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                                 WHEN v_replacement_row.rsvp_status = 'SKIPPED'::rsvp_status THEN 'INVITED'::rsvp_status
                                 ELSE v_replacement_row.rsvp_status
                               END,
           skip_reason       = NULL,
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
  ELSE
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
      p_replacement_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      CASE WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      NULL,
      NULL
    );
  END IF;

  -- 7. Renumber waitlist positions if replacement was on waitlist to prevent gaps
  IF v_replacement_prev_pos IS NOT NULL THEN
    WITH renumbered AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC) AS new_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND waitlist_position IS NOT NULL
    )
    UPDATE public.plan_participants p
       SET waitlist_position = r.new_pos
      FROM renumbered r
     WHERE p.id = r.id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.replace_participant(UUID, UUID, UUID) TO authenticated;
