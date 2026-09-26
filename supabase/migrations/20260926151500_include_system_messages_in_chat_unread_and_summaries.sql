-- Migration: 20260926151500_include_system_messages_in_chat_unread_and_summaries.sql
-- Description: Update get_user_chat_summaries and get_plan_unread_info to count system messages as real chat activity and unread messages.

-- 1. Update get_user_chat_summaries
CREATE OR REPLACE FUNCTION public.get_user_chat_summaries(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  plan_id UUID,
  unread_count BIGINT,
  latest_message_id UUID,
  latest_sender_id UUID,
  latest_content TEXT,
  latest_created_at TIMESTAMPTZ,
  latest_message_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target_user AS (
    SELECT COALESCE(p_user_id, auth.uid()) AS uid
  ),
  user_plans AS (
    SELECT DISTINCT pp.plan_id
    FROM public.plan_participants pp, target_user tu
    WHERE pp.user_id = tu.uid
  ),
  user_reads AS (
    SELECT pcr.plan_id, pcr.last_read_at
    FROM public.plan_chat_reads pcr, target_user tu
    WHERE pcr.user_id = tu.uid
  ),
  ranked_messages AS (
    SELECT
      pm.plan_id,
      pm.id AS latest_message_id,
      pm.sender_id AS latest_sender_id,
      pm.content AS latest_content,
      pm.created_at AS latest_created_at,
      pm.message_type AS latest_message_type,
      ROW_NUMBER() OVER (PARTITION BY pm.plan_id ORDER BY pm.created_at DESC) as rn
    FROM public.plan_messages pm
    JOIN user_plans up ON up.plan_id = pm.plan_id
  ),
  unread_counts AS (
    SELECT
      pm.plan_id,
      COUNT(pm.id) AS count
    FROM public.plan_messages pm
    JOIN user_plans up ON up.plan_id = pm.plan_id
    JOIN target_user tu ON true
    LEFT JOIN user_reads ur ON ur.plan_id = pm.plan_id
    WHERE (
        pm.message_type = 'system'
        OR (pm.message_type IN ('text', 'cost', 'poll') AND pm.sender_id != tu.uid)
      )
      AND (ur.last_read_at IS NULL OR pm.created_at > ur.last_read_at)
    GROUP BY pm.plan_id
  )
  SELECT
    up.plan_id,
    COALESCE(uc.count, 0) AS unread_count,
    rm.latest_message_id,
    rm.latest_sender_id,
    rm.latest_content,
    rm.latest_created_at,
    rm.latest_message_type
  FROM user_plans up
  LEFT JOIN unread_counts uc ON uc.plan_id = up.plan_id
  LEFT JOIN ranked_messages rm ON rm.plan_id = up.plan_id AND rm.rn = 1;
$$;

-- 2. Update get_plan_unread_info
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
      AND (
        pm.message_type = 'system'
        OR (pm.message_type IN ('text', 'cost', 'poll') AND pm.sender_id != p_user_id)
      )
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
