-- Migration: 002_create_users
-- Description: Create the users table for Planless V2

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL CHECK (length(trim(full_name)) > 0),
  profile_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comments for documentation and clarity
COMMENT ON TABLE users IS 'Application profile information for Planless users.';
COMMENT ON COLUMN users.id IS 'Primary key. References auth.users.id.';
COMMENT ON COLUMN users.public_id IS 'Human-readable user ID (e.g. U000001).';
COMMENT ON COLUMN users.full_name IS 'User display name.';
COMMENT ON COLUMN users.profile_url IS 'Profile image URL. Nullable.';
COMMENT ON COLUMN users.bio IS 'Optional profile bio.';
COMMENT ON COLUMN users.created_at IS 'Record creation timestamp.';
COMMENT ON COLUMN users.updated_at IS 'Last update timestamp.';
