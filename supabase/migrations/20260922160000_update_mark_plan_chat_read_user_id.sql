-- Migration: 20260922160000_update_mark_plan_chat_read_user_id.sql
-- Allow passing explicit p_user_id to mark_plan_chat_read with auth.uid() fallback

DROP FUNCTION IF EXISTS public.mark_plan_chat_read(UUID, UUID);
DROP FUNCTION IF EXISTS public.mark_plan_chat_read(UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION public.mark_plan_chat_read(
  p_plan_id UUID,
  p_message_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := COALESCE(p_user_id, auth.uid());
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
