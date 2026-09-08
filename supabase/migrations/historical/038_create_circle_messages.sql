-- Migration: 038_create_circle_messages
-- Description: Create the public.circle_messages table exactly matching the schema spec

-- Drop table first to clean up any incorrect definitions/constraints
DROP TABLE IF EXISTS public.circle_messages CASCADE;

CREATE TABLE public.circle_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  message TEXT NOT NULL,
  status public.message_status NOT NULL DEFAULT 'SENT'::message_status,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  circle_id UUID NOT NULL,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users (id) ON DELETE CASCADE,
  CONSTRAINT circle_messages_circle_id_fkey FOREIGN KEY (circle_id) REFERENCES public.circles (id) ON DELETE CASCADE,
  CONSTRAINT check_message_not_empty CHECK (
    (
      length(
        TRIM(
          BOTH
          FROM
            message
        )
      ) > 0
    )
  )
) TABLESPACE pg_default;

-- Add optimized performance indexes
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.circle_messages USING btree (sender_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_circle_messages_circle_created_at ON public.circle_messages USING btree (circle_id, created_at) TABLESPACE pg_default;

-- Automatic updated_at trigger helper
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_circle_messages_updated_at ON public.circle_messages;
CREATE TRIGGER trigger_update_circle_messages_updated_at
  BEFORE UPDATE ON public.circle_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Document columns and table
COMMENT ON TABLE public.circle_messages IS 'Persistent chat messages sent within a Circle Chat.';
COMMENT ON COLUMN public.circle_messages.id IS 'Primary key.';
COMMENT ON COLUMN public.circle_messages.circle_id IS 'The Circle this message belongs to.';
COMMENT ON COLUMN public.circle_messages.sender_id IS 'The user who sent the message.';
COMMENT ON COLUMN public.circle_messages.message IS 'The message body (plain text only).';
COMMENT ON COLUMN public.circle_messages.status IS 'Delivery status of the message (SENT or RECEIVED).';
COMMENT ON COLUMN public.circle_messages.created_at IS 'Timestamp when row was inserted.';
COMMENT ON COLUMN public.circle_messages.updated_at IS 'Timestamp when row was last modified.';

-- 5. Enable Supabase Realtime for circle_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.circle_messages;

