-- ============================================================================
-- Migration: Create invite_participants SECURITY DEFINER RPC function
-- Description: Handles participant invitations atomically as a trusted operation,
--              enforcing plan_participants.role authorization and allow_participant_invites.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id UUID,
  p_invitee_user_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
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

  -- 3. Fetch plan settings
  SELECT allow_participant_invites
    INTO v_allow_participant_invites
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Authorization Check
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    -- Hosts are always authorized
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    -- Participants allowed when setting is ON
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  -- 5. Process invitees in a single atomic loop
  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if participant record already exists
      SELECT rsvp_status
        INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

      IF FOUND THEN
        -- Reactivate or update existing participant
        UPDATE public.plan_participants
           SET rsvp_status = 'INVITED'::rsvp_status,
               responded_at = NULL,
               skip_reason = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

        v_reactivated_count := v_reactivated_count + 1;
      ELSE
        -- Insert fresh participant
        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Return structured JSON summary
  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'invited_count', v_invited_count,
    'reactivated_count', v_reactivated_count,
    'total_processed', (v_invited_count + v_reactivated_count)
  );
END;
$$;

-- Grant execution permission to authenticated users
GRANT EXECUTE ON FUNCTION public.invite_participants(UUID, UUID[]) TO authenticated;
