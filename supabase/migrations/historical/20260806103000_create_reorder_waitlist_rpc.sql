-- Migration: Create Atomic Waitlist Reordering RPC Function
-- Description: Creates public.reorder_waitlist(UUID, UUID[]) to perform atomic waitlist position updates,
--              switching waitlist_order_mode to CUSTOM, utilizing 2-stage offset update (1000 + pos)
--              inside a single PL/pgSQL transaction to prevent unique index collisions.

CREATE OR REPLACE FUNCTION public.reorder_waitlist(
  p_plan_id UUID,
  p_ordered_user_ids UUID[]
) RETURNS VOID AS $$
BEGIN
  -- 1. Ensure target plan waitlist_order_mode is set to 'CUSTOM'
  UPDATE public.plans
  SET waitlist_order_mode = 'CUSTOM'
  WHERE id = p_plan_id 
    AND (waitlist_order_mode IS DISTINCT FROM 'CUSTOM');

  -- 2. Stage 1: Shift target waitlist positions to temporary offset (1000 + pos)
  --    Guarantees isolation and avoids unique index collision (23505) on (plan_id, waitlist_position)
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

  -- 3. Stage 2: Set final 1-indexed waitlist positions
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

  -- 4. Ensure any participant assigned to GOING has waitlist_position = NULL
  UPDATE public.plan_participants
  SET waitlist_position = NULL
  WHERE plan_id = p_plan_id
    AND assigned_group = 'GOING'::assigned_group_enum
    AND waitlist_position IS NOT NULL;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.reorder_waitlist(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_waitlist(UUID, UUID[]) TO service_role;
