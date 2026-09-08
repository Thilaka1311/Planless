-- Migration: 005_create_plan_participants
-- Description: Create the plan_participants table for Planless V2

CREATE TABLE plan_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role participant_role NOT NULL DEFAULT 'PARTICIPANT'::participant_role,
  rsvp_status rsvp_status NOT NULL DEFAULT 'INVITED'::rsvp_status,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_plan_participant UNIQUE (plan_id, user_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE plan_participants IS 'Tracks user relationships, RSVP responses, and roles for organized plans.';
COMMENT ON COLUMN plan_participants.id IS 'Primary key.';
COMMENT ON COLUMN plan_participants.plan_id IS 'The plan the participant belongs to.';
COMMENT ON COLUMN plan_participants.user_id IS 'The user who is participating.';
COMMENT ON COLUMN plan_participants.role IS 'The role of the participant in the plan (HOST, CO_HOST, PARTICIPANT).';
COMMENT ON COLUMN plan_participants.rsvp_status IS 'RSVP status (INVITED, JOINED, DECLINED, LEFT, REMOVED).';
COMMENT ON COLUMN plan_participants.responded_at IS 'Timestamp when the participant responded to the invitation.';
COMMENT ON COLUMN plan_participants.created_at IS 'Timestamp when the invitation/record was created.';
COMMENT ON COLUMN plan_participants.updated_at IS 'Timestamp when the record was last updated.';

-- Application Workflow Documentation:
-- 1. When a host creates a plan:
--    Insert host into plan_participants with: role = 'HOST', rsvp_status = 'JOINED'
-- 2. When invitations are created:
--    Insert other invited users with: role = 'PARTICIPANT', rsvp_status = 'INVITED'
-- 3. When a participant accepts:
--    Update rsvp_status = 'JOINED', responded_at = now()
-- 4. When a participant declines:
--    Update rsvp_status = 'DECLINED', responded_at = now()
-- 5. When a participant leaves:
--    Update rsvp_status = 'LEFT', responded_at = now()
-- 6. When the host removes a participant:
--    Update rsvp_status = 'REMOVED', responded_at = now()
