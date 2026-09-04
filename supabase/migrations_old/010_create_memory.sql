-- Migration: 010_create_memory
-- Description: Create the memories table for Planless V2

CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completion_id UUID NOT NULL REFERENCES completions(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_memory_completion UNIQUE (completion_id),
  CONSTRAINT unique_memory_plan UNIQUE (plan_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE memories IS 'Represents permanent experience records generated from completed plans.';
COMMENT ON COLUMN memories.id IS 'Primary key.';
COMMENT ON COLUMN memories.completion_id IS 'The completion record associated with this memory.';
COMMENT ON COLUMN memories.plan_id IS 'The plan associated with this memory.';
COMMENT ON COLUMN memories.created_at IS 'Timestamp when the memory record was created.';

-- Application Workflow:
-- 1. A memory is created only after a completion has been verified.
-- 2. The application uses the plan, the completion JSON, the participants, and subcategory logic to render the memory dynamically.
-- 3. The database only stores the mapping relationships; it does not store rendered UI, assets, or media.
