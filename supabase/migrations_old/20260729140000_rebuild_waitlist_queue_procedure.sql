-- Migration: Database Helper & Trigger to Rebuild Waitlist Queue Contiguously
-- Description: 1. Creates public.rebuild_waitlist_queue(p_plan_id UUID) function.
--              2. Updates leave_plan, remove_participant, and update_plan_capacity RPCs
--                 to invoke rebuild_waitlist_queue at the end of execution.

CREATE OR REPLACE FUNCTION public.rebuild_waitlist_queue(p_plan_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_mode waitlist_order_mode_enum := 'AUTO'::waitlist_order_mode_enum;
  v_rec RECORD;
  v_seq INT := 1;
BEGIN
  -- Fetch plan order mode
  SELECT waitlist_order_mode INTO v_order_mode
    FROM public.plans
   WHERE id = p_plan_id;

  -- Step 1: Clear waitlist_position for any SKIPPED or GOING participant
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (assigned_group = 'GOING'::assigned_group_enum OR rsvp_status = 'SKIPPED'::rsvp_status);

  -- Step 2: Renumber all active waitlist participants contiguously 1..N
  FOR v_rec IN
    SELECT id
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND rsvp_status != 'SKIPPED'::rsvp_status
       AND (assigned_group = 'WAITLIST'::assigned_group_enum OR (assigned_group IS NULL AND rsvp_status = 'WAITLISTED'::rsvp_status))
     ORDER BY
       CASE WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum THEN COALESCE(waitlist_position, 2147483647) ELSE 2147483647 END ASC,
       COALESCE(join_queue, 2147483647) ASC,
       COALESCE(joined_queue_at, created_at) ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE id = v_rec.id;

    v_seq := v_seq + 1;
  END LOOP;
END;
$$;