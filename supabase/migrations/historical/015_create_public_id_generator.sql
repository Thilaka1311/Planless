-- Migration: 015_create_public_id_generator
-- Description: Create sequence and function to safely generate sequential user public IDs

-- Create sequence for user public IDs
CREATE SEQUENCE user_public_id_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- Create function to generate formatted user public IDs (e.g. U000001)
CREATE OR REPLACE FUNCTION generate_user_public_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  next_val := nextval('user_public_id_seq');
  RETURN 'U' || lpad(next_val::text, 6, '0');
END;
$$;

-- Comments for documentation and clarity
COMMENT ON SEQUENCE user_public_id_seq IS 'Sequence used exclusively to generate sequential values for user public_id.';
COMMENT ON FUNCTION generate_user_public_id() IS 'Retrieves next sequence value and returns it as a formatted UXXXXXX string.';
