-- Migration: 20260801093000_refactor_hybrid_plan_activity.sql
-- Description: Refactor plan_activity logging to a clean hybrid architecture:
--              1. Plans table trigger handles plan lifecycle events (plan_created, title_changed, etc.).
--              2. Participant trigger strictly handles RSVP status transitions (participant_joined, participant_left, participant_waitlisted).
--              3. RPC functions handle business actions (invite_participants, remove_participant, update_plan_capacity).
--              4. Eliminates auth.uid() reliance in triggers and maps WAITLISTED -> JOINED to participant_joined.

-- 1. TRIGGER ON PLANS TABLE FOR PLAN LIFECYCLE EVENTS
CREATE OR REPLACE FUNCTION public.log_plan_lifecycle_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- INSERT (Plan Creation)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (
      NEW.id,
      NEW.host_id,
      NEW.host_id,
      'plan_created'::plan_activity_type,
      jsonb_build_object('title', NEW.title)
    );
    RETURN NEW;
  END IF;

  -- UPDATE (Plan Property Changes)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'title_changed'::plan_activity_type,
        jsonb_build_object('old_title', OLD.title, 'new_title', NEW.title)
      );
    END IF;

    IF OLD.description IS DISTINCT FROM NEW.description THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'description_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.location IS DISTINCT FROM NEW.location THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'location_changed'::plan_activity_type,
        jsonb_build_object('new_location', NEW.location)
      );
    END IF;

    IF OLD.date IS DISTINCT FROM NEW.date OR OLD.time IS DISTINCT FROM NEW.time THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'date_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.host_id IS DISTINCT FROM NEW.host_id THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), OLD.host_id),
        NEW.host_id,
        'host_transferred'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_plan_lifecycle_activity ON public.plans;

CREATE TRIGGER trg_log_plan_lifecycle_activity
AFTER INSERT OR UPDATE ON public.plans
FOR EACH ROW
EXECUTE FUNCTION public.log_plan_lifecycle_activity();


-- 2. REFACTORED TRIGGER ON PLAN_PARTICIPANTS FOR DATA-INFERRED RSVP TRANSITIONS ONLY
CREATE OR REPLACE FUNCTION public.log_plan_participant_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only react on UPDATE when rsvp_status actually changes
  IF TG_OP = 'UPDATE' AND OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
    
    -- Transition 1: INVITED -> JOINED or WAITLISTED -> JOINED (All map to participant_joined)
    IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_joined'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 2: INVITED -> WAITLISTED
    ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_waitlisted'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );

    -- Transition 3: JOINED / WAITLISTED -> SKIPPED (Voluntary leave only, removed is handled in remove_participant RPC)
    ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status AND COALESCE(NEW.skip_reason, 'LEFT'::skip_reason) != 'REMOVED'::skip_reason THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.plan_id,
        NEW.user_id,
        NEW.user_id,
        'participant_left'::plan_activity_type,
        jsonb_build_object('from_status', OLD.rsvp_status)
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_plan_participant_activity ON public.plan_participants;

CREATE TRIGGER trg_log_plan_participant_activity
AFTER UPDATE ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.log_plan_participant_activity();


-- 3. UPDATE RPC FUNCTIONS FOR BUSINESS ACTIONS

-- 3a. Update invite_participants RPC to log participant_invited
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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  SELECT allow_participant_invites INTO v_allow_participant_invites
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT rsvp_status INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

      IF FOUND THEN
        UPDATE public.plan_participants
           SET rsvp_status = 'INVITED'::rsvp_status,
               responded_at = NULL,
               skip_reason = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_invitee_id;
        v_reactivated_count := v_reactivated_count + 1;
      ELSE
        INSERT INTO public.plan_participants (
          plan_id, user_id, role, rsvp_status, responded_at, skip_reason
        ) VALUES (
          p_plan_id, v_invitee_id, 'PARTICIPANT'::participant_role, 'INVITED'::rsvp_status, NULL, NULL
        );
        v_invited_count := v_invited_count + 1;
      END IF;

      -- Log business activity event for invitation
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (p_plan_id, v_user_id, v_invitee_id, 'participant_invited'::plan_activity_type, '{}'::jsonb);

    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invited_count', v_invited_count,
    'reactivated_count', v_reactivated_count
  );
END;
$$;

-- 3b. Update remove_participant RPC to log participant_removed
CREATE OR REPLACE FUNCTION public.remove_participant(
  p_plan_id          UUID,
  p_target_user_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_id        UUID;
  v_creator_id       UUID;
  v_caller_role      participant_role;
  v_target_status    rsvp_status;
  v_filtering_mode   participant_filtering_type;
  v_max_participants INT;
  v_joined_count     INT;
  v_waitlist_rec     RECORD;
  v_promoted_user_id UUID := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, participant_filtering, max_participants
    INTO v_creator_id, v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  IF p_target_user_id = v_creator_id THEN
    RAISE EXCEPTION 'Cannot remove the creator host' USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  UPDATE public.plan_participants
     SET rsvp_status    = 'SKIPPED'::rsvp_status,
         skip_reason    = 'REMOVED'::skip_reason,
         assigned_group = NULL,
         role           = 'PARTICIPANT'::participant_role,
         responded_at   = now(),
         updated_at     = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  -- Log business activity event for host removal
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
  VALUES (p_plan_id, v_caller_id, p_target_user_id, 'participant_removed'::plan_activity_type, '{}'::jsonb);

  IF v_target_status = 'JOINED'::rsvp_status AND v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
    SELECT count(*) INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_max_participants IS NOT NULL AND v_joined_count < v_max_participants THEN
      SELECT user_id INTO v_waitlist_rec
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND rsvp_status = 'WAITLISTED'::rsvp_status
       ORDER BY joined_queue_at ASC, created_at ASC
       LIMIT 1;

      IF FOUND THEN
        UPDATE public.plan_participants
           SET rsvp_status  = 'JOINED'::rsvp_status,
               skip_reason  = NULL,
               responded_at = now(),
               updated_at   = now()
          WHERE plan_id = p_plan_id AND user_id = v_waitlist_rec.user_id;
        v_promoted_user_id := v_waitlist_rec.user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id,
    'promoted_user_id', v_promoted_user_id
  );
END;
$$;

-- 3c. Update update_plan_capacity RPC to log capacity_changed
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
  v_user_id          UUID;
  v_creator_id       UUID;
  v_old_capacity     INT;
  v_caller_role      participant_role;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, max_participants
    INTO v_creator_id, v_old_capacity
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_user_id = v_creator_id OR v_caller_role IN ('HOST'::participant_role, 'CO_HOST'::participant_role) THEN
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

  -- Log capacity_changed business event
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
  VALUES (
    p_plan_id,
    v_user_id,
    NULL,
    'capacity_changed'::plan_activity_type,
    jsonb_build_object('old_capacity', v_old_capacity, 'new_capacity', p_max_participants)
  );

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'max_participants', p_max_participants
  );
END;
$$;
