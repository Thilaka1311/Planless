-- ============================================================
-- Migration: Atomic remove-and-replace participant RPC
-- Removes a GOING participant entirely and promotes a WAITLIST
-- participant to GOING in a single transaction.
-- Creates NO activity records (caller handles the single
-- participants_swapped activity log).
-- ============================================================

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
BEGIN
  -- 1. Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller is HOST of this plan
  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Unauthorized: only the host can manage participants' USING ERRCODE = '40300';
  END IF;

  -- 3. Lock the promote target row
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_waitlist_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement participant not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Remove the outgoing participant (hard-delete)
  DELETE FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_remove_user_id;

  -- 5. Promote the waitlist participant to GOING
  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
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

GRANT EXECUTE ON FUNCTION public.remove_and_replace_participant(UUID, UUID, UUID) TO authenticated;
