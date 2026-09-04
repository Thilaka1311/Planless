-- Migration: Enforce assigned_group is NULL for Automatic Waitlist plans
-- Description: Updates existing RPCs to prevent assigned_group leakage into Automatic plans, and cleans existing invalid rows.

-- 1. Clean existing invalid data
UPDATE public.plan_participants
   SET assigned_group = NULL
  FROM public.plans p
 WHERE plan_participants.plan_id = p.id
   AND p.participant_filtering = 'AUTOMATIC'::participant_filtering_type
   AND plan_participants.assigned_group IS NOT NULL;

-- 2. Update reorder_waitlist to throw exception if Automatic
CREATE OR REPLACE FUNCTION public.reorder_waitlist(
  p_plan_id UUID,
  p_ordered_user_ids UUID[]
) RETURNS VOID AS $$
DECLARE
  v_waitlist_mode participant_filtering_type;
BEGIN
  SELECT participant_filtering INTO v_waitlist_mode FROM public.plans WHERE id = p_plan_id;
  
  IF v_waitlist_mode = 'AUTOMATIC' THEN
    RAISE EXCEPTION 'Cannot reorder waitlist in Automatic mode' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plans
  SET waitlist_order_mode = 'CUSTOM'
  WHERE id = p_plan_id 
    AND (waitlist_order_mode IS DISTINCT FROM 'CUSTOM');

  UPDATE public.plan_participants AS pp
  SET waitlist_position = 1000 + u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;

  UPDATE public.plan_participants AS pp
  SET waitlist_position = u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;

  UPDATE public.plan_participants
  SET waitlist_position = NULL
  WHERE plan_id = p_plan_id
    AND assigned_group = 'GOING'::assigned_group_enum
    AND waitlist_position IS NOT NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 3. Update auto_promote_waitlist_for_automatic to not use assigned_group
CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_automatic(
  p_plan_id UUID
) RETURNS INT AS $$
DECLARE
  v_max INT;
  v_joined INT;
  v_available INT;
  v_promoted_count INT := 0;
  v_rec RECORD;
  v_waitlist_idx INT := 0;
BEGIN
  SELECT max_participants
    INTO v_max
    FROM public.plans
   WHERE id = p_plan_id;

  IF v_max IS NULL OR v_max <= 0 THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
    INTO v_joined
    FROM public.plan_participants
   WHERE plan_id = p_plan_id 
     AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_max - v_joined;

  IF v_available > 0 THEN
    FOR v_rec IN
      SELECT user_id, skip_reason
        FROM public.plan_participants
       WHERE plan_id = p_plan_id 
         AND rsvp_status = 'WAITLISTED'::rsvp_status
         AND assigned_group IS NULL -- MUST BE NULL for automatic
       ORDER BY waitlist_position ASC NULLS LAST, joined_queue_at ASC, created_at ASC
       LIMIT v_available
    LOOP
      UPDATE public.plan_participants
         SET rsvp_status  = 'JOINED'::rsvp_status,
             skip_reason  = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
             assigned_group = NULL, -- DO NOT SET TO GOING
             waitlist_position = NULL,
             responded_at = now(),
             updated_at   = now()
       WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

      v_promoted_count := v_promoted_count + 1;
    END LOOP;

    IF v_promoted_count > 0 THEN
      FOR v_rec IN
        SELECT user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id 
           AND rsvp_status = 'WAITLISTED'::rsvp_status
           AND assigned_group IS NULL
         ORDER BY waitlist_position ASC NULLS LAST, joined_queue_at ASC, created_at ASC
      LOOP
        v_waitlist_idx := v_waitlist_idx + 1;
        UPDATE public.plan_participants
           SET waitlist_position = v_waitlist_idx,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;
      END LOOP;
    END IF;
  END IF;

  RETURN v_promoted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Update move_participant_to_waitlist_and_decrease_capacity
CREATE OR REPLACE FUNCTION public.move_participant_to_waitlist_and_decrease_capacity(
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
  v_host_id            UUID;
  v_current_max        INT;
  v_new_max            INT;
  v_target_row         RECORD;
  v_next_pos           INT;
  v_waitlist_mode      participant_filtering_type;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT host_id, max_participants, participant_filtering
    INTO v_host_id, v_current_max, v_waitlist_mode
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id != v_host_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role
    ) THEN
      RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
    END IF;
  END IF;

  SELECT assigned_group, rsvp_status, role
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
  END IF;

  -- Calculate next waitlist position ONLY if it's assigned mode, OR just use generic logic
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND (assigned_group = 'WAITLIST'::assigned_group_enum OR (v_waitlist_mode = 'AUTOMATIC'::participant_filtering_type AND rsvp_status = 'WAITLISTED'::rsvp_status));

  v_new_max := GREATEST(2, v_current_max - 1);

  UPDATE public.plans
     SET max_participants = v_new_max,
         updated_at       = now()
   WHERE id = p_plan_id;

  UPDATE public.plan_participants
     SET assigned_group    = CASE WHEN v_waitlist_mode = 'ASSIGNED'::participant_filtering_type THEN 'WAITLIST'::assigned_group_enum ELSE NULL END,
         waitlist_position = v_next_pos,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'plan_id',           p_plan_id,
    'target_user_id',    p_target_user_id,
    'new_capacity',      v_new_max,
    'waitlist_position', v_next_pos
  );
END;
$$;


-- 5. Update remove_and_replace_participant
CREATE OR REPLACE FUNCTION public.remove_and_replace_participant(
  p_plan_id          UUID,
  p_remove_user_id   UUID,
  p_promote_user_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id    UUID;
  v_caller_role  participant_role;
  v_waitlist_row RECORD;
  v_waitlist_mode participant_filtering_type;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Unauthorized: only the host can manage participants' USING ERRCODE = '40300';
  END IF;
  
  SELECT participant_filtering INTO v_waitlist_mode
    FROM public.plans
   WHERE id = p_plan_id;

  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_waitlist_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement participant not found' USING ERRCODE = '40400';
  END IF;

  DELETE FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_remove_user_id;

  UPDATE public.plan_participants
     SET assigned_group    = CASE WHEN v_waitlist_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_waitlist_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                               ELSE v_waitlist_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'removed_user_id',  p_remove_user_id,
    'promoted_user_id', p_promote_user_id
  );
END;
$$;
