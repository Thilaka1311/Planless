-- Migration: 003_create_circles
-- Description: Create circles and circle_members tables for Planless V2

CREATE TABLE circles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role circle_role NOT NULL DEFAULT 'member'::circle_role,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_circle_member UNIQUE (circle_id, user_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE circles IS 'Circles are reusable planning lists of friends to quickly organize plans.';
COMMENT ON COLUMN circles.id IS 'Primary key.';
COMMENT ON COLUMN circles.public_id IS 'Unique, human-readable identifier (e.g. C000001).';
COMMENT ON COLUMN circles.name IS 'Name of the circle.';
COMMENT ON COLUMN circles.created_by IS 'The user who created the circle.';
COMMENT ON COLUMN circles.created_at IS 'Timestamp when the circle was created.';
COMMENT ON COLUMN circles.updated_at IS 'Timestamp when the circle was last updated.';

COMMENT ON TABLE circle_members IS 'Membership and role associations within circles.';
COMMENT ON COLUMN circle_members.id IS 'Primary key.';
COMMENT ON COLUMN circle_members.circle_id IS 'The circle the member belongs to.';
COMMENT ON COLUMN circle_members.user_id IS 'The user who is a member of the circle.';
COMMENT ON COLUMN circle_members.role IS 'The role of the user within the circle (creator_admin, admin, member).';
COMMENT ON COLUMN circle_members.joined_at IS 'Timestamp when the user joined the circle.';
