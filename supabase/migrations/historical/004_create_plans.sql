-- Migration: 004_create_plans
-- Description: Create the plans table for Planless V2

CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id TEXT NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category activity_category NOT NULL,
  subcategory activity_subcategory NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  place_id TEXT NOT NULL,
  place_name TEXT NOT NULL,
  place_address TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  rsvp_deadline TIMESTAMPTZ NOT NULL,
  max_participants INTEGER,
  entry_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status plan_status NOT NULL DEFAULT 'LIVE'::plan_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_title CHECK (length(trim(title)) > 0),
  CONSTRAINT check_rsvp_deadline_before_scheduled CHECK (rsvp_deadline <= scheduled_at),
  CONSTRAINT check_max_participants CHECK (max_participants IS NULL OR max_participants > 0),
  CONSTRAINT check_entry_fee_non_negative CHECK (entry_fee >= 0)
);

-- Comments for documentation and clarity
COMMENT ON TABLE plans IS 'Central table representing activities or events organized by hosts.';
COMMENT ON COLUMN plans.id IS 'Primary key.';
COMMENT ON COLUMN plans.public_id IS 'Unique, human-readable identifier (e.g. P000001).';
COMMENT ON COLUMN plans.host_id IS 'The user hosting the plan.';
COMMENT ON COLUMN plans.category IS 'High-level activity category.';
COMMENT ON COLUMN plans.subcategory IS 'Specific activity subcategory.';
COMMENT ON COLUMN plans.title IS 'The title of the plan.';
COMMENT ON COLUMN plans.description IS 'Optional description or details about the plan.';
COMMENT ON COLUMN plans.place_id IS 'Google Maps Place ID representing the location.';
COMMENT ON COLUMN plans.place_name IS 'Google Maps place name.';
COMMENT ON COLUMN plans.place_address IS 'Google Maps formatted address.';
COMMENT ON COLUMN plans.scheduled_at IS 'The planned start date and time.';
COMMENT ON COLUMN plans.rsvp_deadline IS 'The deadline for participants to RSVP.';
COMMENT ON COLUMN plans.max_participants IS 'Optional limit on the number of participants.';
COMMENT ON COLUMN plans.entry_fee IS 'Participation fee charged to each participant. Defaults to 0.00 (free).';
COMMENT ON COLUMN plans.status IS 'Lifecycle stage of the plan (DRAFT, OPEN, LOCKED, COMPLETED, CANCELLED).';
COMMENT ON COLUMN plans.created_at IS 'Timestamp when the plan record was created.';
COMMENT ON COLUMN plans.updated_at IS 'Timestamp when the plan record was last updated.';
