-- Migration: 20261014101500_add_get_plan_recipients_chat_unreads.sql
-- Description: Authoritatively computes exact unread counts and recent unread messages per recipient using plan_chat_reads and plan_participants

CREATE OR REPLACE FUNCTION public.get_plan_recipients_chat_unreads(
  p_plan_id UUID,
  p_recipient_ids UUID[]
)
RETURNS TABLE (
  recipient_id UUID,
  unread_count BIGINT,
  unread_messages JSONB,
  read_cutoff TIMESTAMPTZ,
  last_read_message_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recipient_cutoffs AS (
    SELECT 
      pp.user_id AS recipient_id,
      COALESCE(pcr.last_read_at, pp.created_at) AS read_cutoff,
      pcr.last_read_message_id
    FROM public.plan_participants pp
    LEFT JOIN public.plan_chat_reads pcr 
      ON pcr.plan_id = pp.plan_id AND pcr.user_id = pp.user_id
    WHERE pp.plan_id = p_plan_id
      AND pp.user_id = ANY(p_recipient_ids)
      AND pp.rsvp_status != 'SKIPPED'
  ),
  unreads_per_recipient AS (
    SELECT 
      rc.recipient_id,
      pm.id,
      pm.sender_id,
      pm.content,
      pm.message_type,
      pm.created_at,
      ROW_NUMBER() OVER (PARTITION BY rc.recipient_id ORDER BY pm.created_at ASC) AS rn,
      COUNT(*) OVER (PARTITION BY rc.recipient_id) AS total_unreads
    FROM recipient_cutoffs rc
    JOIN public.plan_messages pm ON pm.plan_id = p_plan_id
    WHERE pm.sender_id != rc.recipient_id
      AND pm.message_type NOT IN ('cost', 'poll')
      AND (pm.created_at > rc.read_cutoff OR (pm.created_at = rc.read_cutoff AND (rc.last_read_message_id IS NULL OR pm.id != rc.last_read_message_id)))
      AND (rc.last_read_message_id IS NULL OR pm.id != rc.last_read_message_id)
  )
  SELECT 
    rc.recipient_id,
    COALESCE(MAX(u.total_unreads), 0)::BIGINT AS unread_count,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'sender_id', u.sender_id,
          'content', u.content,
          'message_type', u.message_type,
          'created_at', u.created_at
        )
        ORDER BY u.created_at ASC
      ) FILTER (WHERE u.id IS NOT NULL AND u.rn > (u.total_unreads - 8)),
      '[]'::jsonb
    ) AS unread_messages,
    rc.read_cutoff,
    rc.last_read_message_id
  FROM recipient_cutoffs rc
  LEFT JOIN unreads_per_recipient u ON u.recipient_id = rc.recipient_id
  GROUP BY rc.recipient_id, rc.read_cutoff, rc.last_read_message_id;
$$;

GRANT ALL ON FUNCTION public.get_plan_recipients_chat_unreads(UUID, UUID[]) TO authenticated;
GRANT ALL ON FUNCTION public.get_plan_recipients_chat_unreads(UUID, UUID[]) TO service_role;
GRANT ALL ON FUNCTION public.get_plan_recipients_chat_unreads(UUID, UUID[]) TO anon;
