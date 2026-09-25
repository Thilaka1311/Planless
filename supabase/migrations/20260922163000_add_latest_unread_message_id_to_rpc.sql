-- Migration: 20260922163000_add_latest_unread_message_id_to_rpc.sql
-- Function to retrieve unread count, first unread message ID, and latest unread message ID

DROP FUNCTION IF EXISTS public.get_plan_unread_info(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_plan_unread_info(
  p_user_id UUID,
  p_plan_id UUID
)
RETURNS TABLE (
  last_read_message_id UUID,
  last_read_at TIMESTAMPTZ,
  unread_count BIGINT,
  first_unread_message_id UUID,
  latest_unread_message_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH user_read AS (
    SELECT pcr.last_read_at, pcr.last_read_message_id
    FROM public.plan_chat_reads pcr
    WHERE pcr.user_id = p_user_id AND pcr.plan_id = p_plan_id
  ),
  unreads AS (
    SELECT
      pm.id,
      pm.created_at,
      ROW_NUMBER() OVER (ORDER BY pm.created_at ASC) as rn,
      COUNT(*) OVER () as total_count
    FROM public.plan_messages pm
    LEFT JOIN user_read ur ON true
    WHERE pm.plan_id = p_plan_id
      AND pm.sender_id != p_user_id
      AND pm.message_type IN ('text', 'cost', 'poll')
      AND (ur.last_read_at IS NULL OR pm.created_at > ur.last_read_at)
  )
  SELECT
    ur.last_read_message_id,
    ur.last_read_at,
    COALESCE((SELECT total_count FROM unreads LIMIT 1), 0)::BIGINT AS unread_count,
    (SELECT u.id FROM unreads u WHERE u.rn = 1) AS first_unread_message_id,
    (SELECT u.id FROM unreads u WHERE u.rn = u.total_count) AS latest_unread_message_id
  FROM (SELECT 1) dummy
  LEFT JOIN user_read ur ON true;
$$;
