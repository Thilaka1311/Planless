-- Migration: 008_create_chat
-- Description: Create the chat_messages table for Planless V2

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status message_status NOT NULL DEFAULT 'SENT'::message_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_message_not_empty CHECK (length(trim(message)) > 0)
);

-- Comments for documentation and clarity
COMMENT ON TABLE chat_messages IS 'Communication messages sent within plans.';
COMMENT ON COLUMN chat_messages.id IS 'Primary key.';
COMMENT ON COLUMN chat_messages.plan_id IS 'The plan/chat session the message belongs to.';
COMMENT ON COLUMN chat_messages.sender_id IS 'The user who sent the message.';
COMMENT ON COLUMN chat_messages.message IS 'The text content of the message.';
COMMENT ON COLUMN chat_messages.status IS 'Delivery status of the message (SENT, DELIVERED).';
COMMENT ON COLUMN chat_messages.created_at IS 'Timestamp when the message was sent.';
COMMENT ON COLUMN chat_messages.updated_at IS 'Timestamp when the message was last updated.';

-- Application Workflow:
-- 1. When a participant sends a message:
--    Insert message with: status = 'SENT'
-- 2. When the backend successfully delivers the message:
--    Update: status = 'DELIVERED'
-- Note: There is no read receipt/SEEN status in V2. Only active participants of the plan can send/view messages.
