-- Migration: 20260731123000_create_plan_messages.sql
-- Description: Create the plan_messages table and define RLS policies for Planless plan chat.

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.plan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,

  CONSTRAINT check_plan_message_content_not_empty CHECK (length(trim(content)) > 0)
);

-- 2. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_plan_messages_plan_id ON public.plan_messages(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_messages_plan_created_at ON public.plan_messages(plan_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plan_messages_sender_id ON public.plan_messages(sender_id);

-- 3. DOCUMENTATION COMMENTS
COMMENT ON TABLE public.plan_messages IS 'Stores chat messages for individual plans. Each plan acts as its own chat.';
COMMENT ON COLUMN public.plan_messages.id IS 'Primary key message UUID.';
COMMENT ON COLUMN public.plan_messages.plan_id IS 'The plan this message belongs to.';
COMMENT ON COLUMN public.plan_messages.sender_id IS 'The user who sent the message (references public.users.id).';
COMMENT ON COLUMN public.plan_messages.message_type IS 'Message payload type (text, system, image). Defaults to text.';
COMMENT ON COLUMN public.plan_messages.content IS 'The textual content or payload of the message.';
COMMENT ON COLUMN public.plan_messages.created_at IS 'Timestamp when the message was created.';
COMMENT ON COLUMN public.plan_messages.updated_at IS 'Timestamp when the message was last edited.';

-- 4. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.plan_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow plan participants to select messages" ON public.plan_messages;
DROP POLICY IF EXISTS "Allow plan participants to insert messages" ON public.plan_messages;
DROP POLICY IF EXISTS "Deny all updates on plan messages" ON public.plan_messages;
DROP POLICY IF EXISTS "Deny all deletes on plan messages" ON public.plan_messages;

-- SELECT Policy: Users can only read messages if they are a participant of the corresponding plan
CREATE POLICY "Allow plan participants to select messages"
ON public.plan_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_messages.plan_id
      AND plan_participants.user_id = auth.uid()
  )
);

-- INSERT Policy: Users can only insert messages if sender_id matches their authenticated ID and they are a participant of the plan
CREATE POLICY "Allow plan participants to insert messages"
ON public.plan_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_messages.plan_id
      AND plan_participants.user_id = auth.uid()
  )
);

-- UPDATE Policy: Deny all updates by default until edited messages are explicitly scoped
CREATE POLICY "Deny all updates on plan messages"
ON public.plan_messages
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- DELETE Policy: Deny all deletes by default
CREATE POLICY "Deny all deletes on plan messages"
ON public.plan_messages
FOR DELETE
TO authenticated
USING (false);
