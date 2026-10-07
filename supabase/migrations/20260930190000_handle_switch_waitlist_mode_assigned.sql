-- Migration: Handle switching waitlist mode from Automatic to Assigned and vice-versa
-- Core rule: RSVP STATUS IS IMMUTABLE ONCE AN INVITE EXISTS.
-- - When a participant's RSVP status is INVITED, the host or any other participant must NEVER change that RSVP status to JOINED or WAITLISTED.
-- - Switching Waitlist Mode (Automatic ↔ Assigned) must NEVER change a participant's RSVP status.
-- - Changing Plan Size must NEVER change a participant's RSVP status.
-- - Moving someone between Joined and Waitlist only changes their PARTICIPANT GROUP/ASSIGNMENT, never their RSVP status.
-- - INVITED must remain INVITED regardless of whether that participant is currently in the Joined group or Waitlist group.
-- - The only participant whose RSVP status changes should be the participant themselves through the normal RSVP flow.
-- - Other statuses such as SKIPPED can continue to behave normally according to existing rules.
--
-- Plan Size rule:
-- PLAN SIZE = NUMBER OF JOINED PARTICIPANTS whenever enough eligible participants exist.
-- Priority logic decides WHO occupies the Join slots (assigned_group = 'GOING'):
-- 1. Host(s) first
-- 2. Participants who were already JOINED / accepted
-- 3. If remaining Join slots exist, participants who are WAITLISTED in queue order
-- 4. If remaining Join slots exist, other eligible (INVITED) participants in priority order
-- All remaining eligible participants become WAITLIST (assigned_group = 'WAITLIST') with contiguous waitlist_position 1..N.

CREATE OR REPLACE FUNCTION public.handle_switch_to_assigned_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan_size INT;
  v_was_system_op TEXT;
BEGIN
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- CASE 1: Switching to ASSIGNED mode
  IF NEW.participant_filtering = 'ASSIGNED'::participant_filtering_type 
     AND (OLD.participant_filtering IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type) THEN

    v_plan_size := NEW.plan_size;
    IF v_plan_size IS NOT NULL AND v_plan_size >= 1 THEN

      -- 0. Clear all waitlist_positions first to prevent any partial unique index collision
      UPDATE public.plan_participants
         SET waitlist_position = NULL
       WHERE plan_id = NEW.id;

      -- 1. Rank ALL eligible participants:
      -- Priority:
      --   - Host first
      --   - Already JOINED first
      --   - Already WAITLISTED next
      --   - Existing waitlist_position
      --   - Earliest joined_queue_at
      --   - Earliest created_at
      -- Fill all available Join slots up to v_plan_size.
      -- NOTE: rsvp_status is IMMUTABLE across mode switches! Only assigned_group is updated.
      WITH ranked_eligible AS (
        SELECT pp.user_id,
               ROW_NUMBER() OVER (
                 ORDER BY 
                   (pp.role = 'HOST'::participant_role) DESC,
                   (pp.rsvp_status = 'JOINED'::rsvp_status) DESC,
                   (pp.rsvp_status = 'WAITLISTED'::rsvp_status) DESC,
                   pp.waitlist_position ASC NULLS LAST,
                   pp.joined_queue_at ASC NULLS LAST,
                   pp.created_at ASC
               ) AS rank
          FROM public.plan_participants pp
         WHERE pp.plan_id = NEW.id
           AND pp.rsvp_status != 'SKIPPED'::rsvp_status
      )
      UPDATE public.plan_participants pp
         SET assigned_group    = CASE WHEN re.rank <= v_plan_size THEN 'GOING'::assigned_group_enum ELSE 'WAITLIST'::assigned_group_enum END,
             waitlist_position = NULL,
             updated_at        = now()
        FROM ranked_eligible re
       WHERE pp.plan_id = NEW.id
         AND pp.user_id = re.user_id;

      -- 2. Renumber waitlist positions contiguously 1..N for WAITLIST participants
      WITH numbered_waitlist AS (
        SELECT pp.user_id,
               ROW_NUMBER() OVER (
                 ORDER BY 
                   (pp.rsvp_status = 'WAITLISTED'::rsvp_status) DESC,
                   pp.waitlist_position ASC NULLS LAST,
                   pp.joined_queue_at ASC NULLS LAST,
                   pp.created_at ASC
               ) AS new_pos
          FROM public.plan_participants pp
         WHERE pp.plan_id = NEW.id
           AND pp.assigned_group = 'WAITLIST'::assigned_group_enum
           AND pp.rsvp_status != 'SKIPPED'::rsvp_status
      )
      UPDATE public.plan_participants pp
         SET waitlist_position = nw.new_pos,
             updated_at        = now()
        FROM numbered_waitlist nw
       WHERE pp.plan_id = NEW.id
         AND pp.user_id = nw.user_id;

      -- 3. SKIPPED participants have waitlist_position = NULL
      UPDATE public.plan_participants
         SET waitlist_position = NULL
       WHERE plan_id = NEW.id
         AND rsvp_status = 'SKIPPED'::rsvp_status;

    END IF;

  -- CASE 2: Switching from ASSIGNED to AUTOMATIC mode
  ELSIF NEW.participant_filtering = 'AUTOMATIC'::participant_filtering_type 
        AND (OLD.participant_filtering = 'ASSIGNED'::participant_filtering_type) THEN

    -- In AUTOMATIC mode: assigned_group = NULL, waitlist_position = NULL
    -- NOTE: rsvp_status is IMMUTABLE across mode switches! Only assigned_group and waitlist_position are cleared.
    UPDATE public.plan_participants pp
       SET assigned_group    = NULL,
           waitlist_position = NULL,
           updated_at        = now()
     WHERE pp.plan_id = NEW.id;

  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_handle_switch_waitlist_mode ON public.plans;
CREATE TRIGGER trg_handle_switch_waitlist_mode
  AFTER UPDATE OF participant_filtering ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_switch_to_assigned_mode();

-- Database Trigger: Enforce that INVITED RSVP status is immutable by non-self actions
-- When a participant's RSVP status is INVITED, only the participant themselves can change it to JOINED or WAITLISTED.
CREATE OR REPLACE FUNCTION public.trg_enforce_invited_rsvp_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- If participant's existing rsvp_status is INVITED
  IF OLD.rsvp_status = 'INVITED'::rsvp_status THEN
    -- If an update attempts to change rsvp_status to JOINED or WAITLISTED:
    IF NEW.rsvp_status IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN
      -- Only allowed if it is the participant themselves acting via auth.uid() OR an explicit self-rsvp session variable
      IF auth.uid() IS NOT NULL AND auth.uid() != OLD.user_id AND current_setting('app.is_self_rsvp', true) IS DISTINCT FROM 'true' THEN
        -- Revert rsvp_status back to INVITED
        NEW.rsvp_status := OLD.rsvp_status;
      ELSIF auth.uid() IS NULL AND current_setting('app.is_self_rsvp', true) IS DISTINCT FROM 'true' THEN
        -- Background / system / trigger operations (like mode switch or plan capacity update) must NEVER mutate INVITED
        NEW.rsvp_status := OLD.rsvp_status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invited_rsvp_immutable ON public.plan_participants;
CREATE TRIGGER trg_enforce_invited_rsvp_immutable
  BEFORE UPDATE OF rsvp_status ON public.plan_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_enforce_invited_rsvp_immutable();

-- One-time repair for any existing ASSIGNED plans:
-- 1. Restore INVITED status for participants who have not personally accepted
-- 2. Fill all Join slots up to plan_size via assigned_group = 'GOING'
DO $$
DECLARE
  v_plan RECORD;
  v_plan_size INT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  -- Explicit repair for plan Lunch (43643d33-7546-4bc3-8834-bc16346c3285)
  -- Renjith is HOST (JOINED), Bhaavya is accepted (JOINED)
  -- Thilaka Sundar, Aznan, RAAM, Ren were invited and should be INVITED
  UPDATE public.plan_participants
     SET rsvp_status = 'INVITED'::rsvp_status
   WHERE plan_id = '43643d33-7546-4bc3-8834-bc16346c3285'
     AND user_id IN (
       'c3dc4291-f7d7-4cf5-88f3-6be5cdb71353', -- Thilaka Sundar
       '723cddf6-e1fb-4053-a12c-e330186a0369', -- Aznan
       '1d1aed6a-d5e3-4263-b8b7-94f27982387f', -- RAAM
       '86d22a57-feb3-4b27-8d33-81478f5970e8'  -- Ren
     );

  FOR v_plan IN 
    SELECT id, plan_size 
      FROM public.plans 
     WHERE participant_filtering = 'ASSIGNED'::participant_filtering_type 
       AND plan_size IS NOT NULL
  LOOP
    v_plan_size := v_plan.plan_size;

    -- 0. Clear waitlist_position first
    UPDATE public.plan_participants
       SET waitlist_position = NULL
     WHERE plan_id = v_plan.id;

    -- 1. Fill all available Join slots up to plan_size using priority
    -- Only modifies assigned_group, NEVER mutates rsvp_status!
    WITH ranked_eligible AS (
      SELECT pp.user_id,
             ROW_NUMBER() OVER (
               ORDER BY 
                 (pp.role = 'HOST'::participant_role) DESC,
                 (pp.rsvp_status = 'JOINED'::rsvp_status) DESC,
                 (pp.rsvp_status = 'WAITLISTED'::rsvp_status) DESC,
                 pp.waitlist_position ASC NULLS LAST,
                 pp.joined_queue_at ASC NULLS LAST,
                 pp.created_at ASC
             ) AS rank
        FROM public.plan_participants pp
       WHERE pp.plan_id = v_plan.id
         AND pp.rsvp_status != 'SKIPPED'::rsvp_status
    )
    UPDATE public.plan_participants pp
       SET assigned_group    = CASE WHEN re.rank <= v_plan_size THEN 'GOING'::assigned_group_enum ELSE 'WAITLIST'::assigned_group_enum END,
           waitlist_position = NULL,
           updated_at        = now()
      FROM ranked_eligible re
     WHERE pp.plan_id = v_plan.id
       AND pp.user_id = re.user_id;

    -- 2. Renumber waitlist
    WITH numbered_waitlist AS (
      SELECT pp.user_id,
             ROW_NUMBER() OVER (
               ORDER BY 
                 (pp.rsvp_status = 'WAITLISTED'::rsvp_status) DESC,
                 pp.waitlist_position ASC NULLS LAST,
                 pp.joined_queue_at ASC NULLS LAST,
                 pp.created_at ASC
             ) AS new_pos
        FROM public.plan_participants pp
       WHERE pp.plan_id = v_plan.id
         AND pp.assigned_group = 'WAITLIST'::assigned_group_enum
         AND pp.rsvp_status != 'SKIPPED'::rsvp_status
    )
    UPDATE public.plan_participants pp
       SET waitlist_position = nw.new_pos,
           updated_at        = now()
      FROM numbered_waitlist nw
     WHERE pp.plan_id = v_plan.id
       AND pp.user_id = nw.user_id;

    UPDATE public.plan_participants
       SET waitlist_position = NULL
     WHERE plan_id = v_plan.id
       AND rsvp_status = 'SKIPPED'::rsvp_status;

  END LOOP;

  PERFORM set_config('app.system_op', 'false', true);
END;
$$;
