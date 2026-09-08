-- Drop obsolete 2-arg overload to prevent function ambiguity when 3rd arg is defaulted
DROP FUNCTION IF EXISTS public.invite_participants(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.invite_participants(
  p_plan_id UUID,
  p_invitee_user_ids UUID[],
  p_assigned_group assigned_group_enum DEFAULT NULL
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
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_total_invited INT := 0;
  v_final_max_participants INT;
  v_final_plan_size INT;
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

  -- 3. Fetch plan settings & filtering mode
  SELECT allow_participant_invites, participant_filtering
    INTO v_allow_participant_invites, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

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

  -- Determine effective assigned_group (NULL if AUTOMATIC)
  IF v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
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
      SELECT rsvp_status
        INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

      IF FOUND THEN
        -- Reactivate or update existing participant
        UPDATE public.plan_participants
           SET rsvp_status = 'INVITED'::rsvp_status,
               assigned_group = v_target_assigned_group,
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
          assigned_group,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Invariant: plans.max_participants must always be at least the total invited participant count
  SELECT COUNT(*)
    INTO v_total_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  UPDATE public.plans
     SET max_participants = GREATEST(COALESCE(max_participants, 0), v_total_invited),
         updated_at = now()
   WHERE id = p_plan_id
     AND (max_participants IS NULL OR max_participants < v_total_invited);

  SELECT max_participants, plan_size
    INTO v_final_max_participants, v_final_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'total_invited_count',  v_total_invited,
    'max_participants',     v_final_max_participants,
    'plan_size',            v_final_plan_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_participants(UUID, UUID[], assigned_group_enum) TO authenticated;

-- 7. Backfill existing plans where max_participants < total invited participants
WITH invited_counts AS (
  SELECT plan_id, COUNT(*) AS total_invited
    FROM public.plan_participants
   WHERE rsvp_status != 'SKIPPED'::rsvp_status
   GROUP BY plan_id
)
UPDATE public.plans p
   SET max_participants = GREATEST(COALESCE(p.max_participants, 0), ic.total_invited),
       updated_at = now()
  FROM invited_counts ic
 WHERE p.id = ic.plan_id
   AND (p.max_participants IS NULL OR p.max_participants < ic.total_invited);
