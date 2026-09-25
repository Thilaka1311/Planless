-- Migration: 20260922140000_add_plan_chat_reads.sql
-- Description: Add plan_chat_reads table, indexes, RLS, and functions for WhatsApp-style unread message counts

-- 1. Create table for tracking user read positions per plan
CREATE TABLE IF NOT EXISTS public.plan_chat_reads (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES public.plan_messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plan_id)
);

-- 2. Indexes for fast user lookups and unread count calculations
CREATE INDEX IF NOT EXISTS idx_plan_chat_reads_user_id 
  ON public.plan_chat_reads(user_id);

CREATE INDEX IF NOT EXISTS idx_plan_messages_plan_sender_created 
  ON public.plan_messages(plan_id, sender_id, created_at);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.plan_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chat read state" ON public.plan_chat_reads;
CREATE POLICY "Users can view their own chat read state"
  ON public.plan_chat_reads
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own chat read state" ON public.plan_chat_reads;
CREATE POLICY "Users can insert their own chat read state"
  ON public.plan_chat_reads
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own chat read state" ON public.plan_chat_reads;
CREATE POLICY "Users can update their own chat read state"
  ON public.plan_chat_reads
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Enable Realtime on plan_chat_reads
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'plan_chat_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.plan_chat_reads;
  END IF;
END $$;

-- 5. Helper Function: mark_plan_chat_read
-- Safely upserts the user's read position up to the given message (or latest message in plan)
CREATE OR REPLACE FUNCTION public.mark_plan_chat_read(
  p_plan_id UUID,
  p_message_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_message_created_at TIMESTAMPTZ;
  v_target_message_id UUID := p_message_id;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- If message_id was provided, find its timestamp
  IF v_target_message_id IS NOT NULL THEN
    SELECT created_at INTO v_message_created_at
    FROM public.plan_messages
    WHERE id = v_target_message_id AND plan_id = p_plan_id;
  END IF;

  -- If no specific message provided or not found, use latest message in plan
  IF v_message_created_at IS NULL THEN
    SELECT id, created_at INTO v_target_message_id, v_message_created_at
    FROM public.plan_messages
    WHERE plan_id = p_plan_id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Fallback if chat has no messages yet
  IF v_message_created_at IS NULL THEN
    v_message_created_at := now();
  END IF;

  -- Upsert read position
  INSERT INTO public.plan_chat_reads (user_id, plan_id, last_read_message_id, last_read_at, updated_at)
  VALUES (v_user_id, p_plan_id, v_target_message_id, v_message_created_at, now())
  ON CONFLICT (user_id, plan_id)
  DO UPDATE SET
    last_read_message_id = EXCLUDED.last_read_message_id,
    last_read_at = GREATEST(public.plan_chat_reads.last_read_at, EXCLUDED.last_read_at),
    updated_at = now();
END;
$$;

-- 6. High-performance Function: get_user_chat_summaries
-- Returns unread count and latest message preview for all plans the user is part of
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
    WHERE pm.sender_id != tu.uid
      AND pm.message_type IN ('text', 'cost', 'poll')
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
