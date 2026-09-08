-- Migration: Preserve ASSIGNED waitlist_position during queue renumbering
-- Description: Updates public.rebuild_waitlist_queue(UUID) to check both waitlist_order_mode and participant_filtering.
--              When participant_filtering = 'ASSIGNED', waitlist_position is the primary sort key.

CREATE OR REPLACE FUNCTION public.rebuild_waitlist_queue(
  p_plan_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_mode waitlist_order_mode_enum;
  v_filtering  participant_filtering_type;
  v_rec        RECORD;
  v_seq        INT := 1;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  SELECT COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum),
         COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type)
    INTO v_order_mode, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  -- Step 1: Clear waitlist_position for any SKIPPED or GOING participant
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (assigned_group = 'GOING'::assigned_group_enum OR rsvp_status = 'SKIPPED'::rsvp_status);

  -- Step 2: Renumber all active waitlist participants contiguously 1..N
  FOR v_rec IN
    SELECT plan_id, user_id
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND rsvp_status != 'SKIPPED'::rsvp_status
       AND (assigned_group = 'WAITLIST'::assigned_group_enum OR (assigned_group IS NULL AND rsvp_status = 'WAITLISTED'::rsvp_status))
     ORDER BY
       CASE 
         WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum OR v_filtering = 'ASSIGNED'::participant_filtering_type 
         THEN COALESCE(waitlist_position, 2147483647) 
         ELSE 2147483647 
       END ASC,
       COALESCE(joined_queue_at, created_at) ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE plan_id = v_rec.plan_id
       AND user_id = v_rec.user_id;

    v_seq := v_seq + 1;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_waitlist_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_waitlist_queue(UUID) TO service_role;
