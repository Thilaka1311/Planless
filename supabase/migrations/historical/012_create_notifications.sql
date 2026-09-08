-- Migration: 012_create_notifications
-- Description: Create the notifications table for Planless V2

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  related_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- Comments for documentation and clarity
COMMENT ON TABLE notifications IS 'Inbox records tracking important events requiring user attention.';
COMMENT ON COLUMN notifications.id IS 'Primary key.';
COMMENT ON COLUMN notifications.user_id IS 'The user who receives the notification.';
COMMENT ON COLUMN notifications.type IS 'The type of event (PLAN_INVITATION, FRIEND_REQUEST, etc.).';
COMMENT ON COLUMN notifications.title IS 'Notification title.';
COMMENT ON COLUMN notifications.body IS 'Detailed message body.';
COMMENT ON COLUMN notifications.related_plan_id IS 'Optional reference to the associated plan. Set to NULL if the plan is deleted.';
COMMENT ON COLUMN notifications.is_read IS 'Read status of the notification.';
COMMENT ON COLUMN notifications.created_at IS 'Timestamp when the notification was created.';
COMMENT ON COLUMN notifications.read_at IS 'Timestamp when the notification was marked as read.';

-- Application Workflow:
-- 1. Create notifications only for important system events (invitations, rsvp changes, friend requests, payment reminders, etc.).
-- 2. When a user opens a notification, the application updates:
--    is_read = TRUE, read_at = now()
