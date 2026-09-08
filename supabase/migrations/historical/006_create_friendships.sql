-- Migration: 006_create_friendships
-- Description: Create the friendships table for Planless V2 using a canonical friendship model

CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_from_plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status friendship_status NOT NULL DEFAULT 'PENDING'::friendship_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT check_canonical_order CHECK (user_1_id < user_2_id),
  CONSTRAINT check_requested_by CHECK (requested_by = user_1_id OR requested_by = user_2_id),
  CONSTRAINT unique_friendship UNIQUE (user_1_id, user_2_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE friendships IS 'Canonical friendships and friend requests originating from shared plans.';
COMMENT ON COLUMN friendships.id IS 'Primary key.';
COMMENT ON COLUMN friendships.user_1_id IS 'The user with the lexicographically smaller UUID in the friendship.';
COMMENT ON COLUMN friendships.user_2_id IS 'The user with the lexicographically larger UUID in the friendship.';
COMMENT ON COLUMN friendships.requested_by IS 'The user who initiated the friend request (must be user_1_id or user_2_id).';
COMMENT ON COLUMN friendships.created_from_plan_id IS 'The plan where the users met and initiated the connection.';
COMMENT ON COLUMN friendships.status IS 'Friend request status (PENDING, ACCEPTED, REJECTED).';
COMMENT ON COLUMN friendships.created_at IS 'Friend request creation timestamp.';
COMMENT ON COLUMN friendships.responded_at IS 'Timestamp when the status was accepted or rejected.';

-- Application Workflow Documentation:
-- 1. Sending a Friend Request:
--    - Sort the two user UUIDs (smaller UUID goes to user_1_id, larger goes to user_2_id).
--    - Set requested_by to the sender.
--    - Set status = 'PENDING'.
-- 2. Accepting a Friend Request:
--    - Update status = 'ACCEPTED', responded_at = now().
-- 3. Rejecting a Friend Request:
--    - Update status = 'REJECTED', responded_at = now().
-- Note: Friend requests can only be initiated between participants of the same completed plan.
