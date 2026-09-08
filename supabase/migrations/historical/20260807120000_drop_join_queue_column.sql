-- Migration: Drop obsolete join_queue column, triggers, and function references
-- Description: Completely drops join_queue column from plan_participants and updates procedures to rely on joined_queue_at timestamp / created_at timestamp.

-- 1. Drop trigger & function if existing
DROP TRIGGER IF EXISTS trg_auto_assign_join_queue_trigger ON public.plan_participants;
DROP FUNCTION IF EXISTS public.trg_auto_assign_join_queue();

-- 2. Drop join_queue column from plan_participants table
ALTER TABLE public.plan_participants
  DROP COLUMN IF EXISTS join_queue;

-- 3. Re-define rebuild_waitlist_queue procedure without join_queue
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
  v_rec        RECORD;
  v_seq        INT := 1;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  SELECT COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum)
    INTO v_order_mode
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
       CASE WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum THEN COALESCE(waitlist_position, 2147483647) ELSE 2147483647 END ASC,
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
