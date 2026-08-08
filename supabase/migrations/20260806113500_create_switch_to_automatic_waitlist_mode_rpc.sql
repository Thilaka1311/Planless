-- Migration: Create Atomic switch_to_automatic_waitlist_mode RPC Function
-- Description: Creates public.switch_to_automatic_waitlist_mode(p_plan_id UUID, p_promoted_user_ids UUID[])
--              to atomically promote selected eligible waitlist participants (WAITLIST + JOINED) to fill vacant GOING spots,
--              clear waitlist_position, and switch participant_filtering to AUTOMATIC inside a single transaction.

CREATE OR REPLACE FUNCTION public.switch_to_automatic_waitlist_mode(
  p_plan_id UUID,
  p_promoted_user_ids UUID[] DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
  v_filtering_mode           participant_filtering_type;
  v_max_participants         INT;
  v_going_count              INT;
  v_vacant_spots             INT;
  v_promoted_count           INT;
  v_valid_promoted_count     INT;
BEGIN
  -- 1. Lock and fetch target plan settings
  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 2. Verify plan is currently in ASSIGNED filtering mode
  IF v_filtering_mode <> 'ASSIGNED'::participant_filtering_type THEN
    RAISE EXCEPTION 'Plan is not in ASSIGNED waitlist mode' USING ERRCODE = '40000';
  END IF;

  -- 3. Calculate current GOING count and vacant spots
  SELECT COUNT(*) INTO v_going_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'GOING'::assigned_group_enum;

  v_vacant_spots := GREATEST(0, v_max_participants - v_going_count);
  v_promoted_count := COALESCE(array_length(p_promoted_user_ids, 1), 0);

  -- 4. Validation when vacant spots exist
  IF v_vacant_spots > 0 THEN
    IF v_promoted_count <> v_vacant_spots THEN
      RAISE EXCEPTION 'Must select exactly % participants to fill available GOING spots (received %)', 
        v_vacant_spots, v_promoted_count USING ERRCODE = '40001';
    END IF;

    -- Validate that all selected user IDs exist in WAITLIST group with rsvp_status = 'JOINED'
    SELECT COUNT(*) INTO v_valid_promoted_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids)
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_valid_promoted_count <> v_promoted_count THEN
      RAISE EXCEPTION 'One or more selected participants are not eligible for promotion (must be WAITLIST + JOINED)'
        USING ERRCODE = '40002';
    END IF;

    -- Promote selected participants to GOING and clear waitlist_position
    UPDATE public.plan_participants
       SET assigned_group = 'GOING'::assigned_group_enum,
           waitlist_position = NULL,
           updated_at = now()
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids);
  END IF;

  -- 5. Switch plan participant_filtering to AUTOMATIC
  UPDATE public.plans
     SET participant_filtering = 'AUTOMATIC'::participant_filtering_type
   WHERE id = p_plan_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execution permissions to authenticated users and service_role
GRANT EXECUTE ON FUNCTION public.switch_to_automatic_waitlist_mode(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_to_automatic_waitlist_mode(UUID, UUID[]) TO service_role;
