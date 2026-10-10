-- Migration: 20261009183500_fix_invite_participants_found_clobber.sql
-- Description: Ensure v_participant_exists is captured prior to MAX(waitlist_position) computation,
-- preventing FOUND clobbering in invite_participants RPC.

CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id uuid,
  p_invitee_user_ids uuid[],
  p_assigned_group assigned_group_enum DEFAULT NULL::assigned_group_enum
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_existing_waitlist_pos INT;
  v_participant_exists BOOLEAN;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_current_plan_size INT;
  v_current_invited INT;
  v_next_pos INT;
BEGIN
  -- 1. Identify authenticated user from JWT context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch caller's role in the plan
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 3. Fetch plan settings & filtering mode, locking row
  SELECT allow_participant_invites, participant_filtering,
         plan_size,
         COALESCE(invited_participants, 0)
    INTO v_allow_participant_invites, v_filtering,
         v_current_plan_size, v_current_invited
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Ensure v_current_invited accurately reflects current active participants
  SELECT COUNT(*)
    INTO v_current_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  -- 4. Authorization Check
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  -- Determine effective assigned_group:
  -- In Automatic mode: always NULL
  -- In Assigned mode:
  --   If called by a PARTICIPANT: always 'WAITLIST' (participants cannot assign to GOING)
  --   If called by a HOST: respect p_assigned_group, defaulting to 'GOING'
  IF v_filtering IS NULL OR v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role THEN
    v_target_assigned_group := 'WAITLIST'::assigned_group_enum;
  ELSE
    v_target_assigned_group := COALESCE(p_assigned_group, 'GOING'::assigned_group_enum);
  END IF;

  -- 5. Process invitees in a single atomic loop
  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if participant record already exists
      SELECT rsvp_status, waitlist_position
        INTO v_existing_status, v_existing_waitlist_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id
         FOR UPDATE;

      v_participant_exists := FOUND;

      -- Determine waitlist position if placed into WAITLIST
      IF v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        SELECT COALESCE(MAX(waitlist_position), 0) + 1
          INTO v_next_pos
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum;
      ELSE
        v_next_pos := NULL;
      END IF;

      IF v_participant_exists THEN
        IF v_existing_status = 'SKIPPED'::rsvp_status THEN
          -- Reactivation (SKIPPED -> active INVITED)
          v_current_invited := v_current_invited + 1;

          UPDATE public.plan_participants
             SET rsvp_status = 'INVITED'::rsvp_status,
                 assigned_group = v_target_assigned_group,
                 waitlist_position = CASE
                   WHEN v_target_assigned_group = 'WAITLIST'::assigned_group_enum THEN
                     COALESCE(waitlist_position, v_next_pos)
                   ELSE NULL
                 END,
                 responded_at = NULL,
                 skip_reason = NULL,
                 updated_at = now()
           WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

          v_reactivated_count := v_reactivated_count + 1;
        END IF;
      ELSE
        -- Insert new participant record as INVITED
        v_current_invited := v_current_invited + 1;

        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          assigned_group,
          joined_queue_at,
          waitlist_position,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          v_next_pos,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Persist invited_participants only (plan_size remains unchanged)
  UPDATE public.plans
     SET invited_participants = v_current_invited,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'assigned_group',       v_target_assigned_group::text,
    'invited_participants', v_current_invited
  );
END;
$$;

ALTER FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.invite_participants(uuid, uuid[], assigned_group_enum) TO authenticated, service_role;
