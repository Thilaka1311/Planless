-- Migration: 009_create_completion
-- Description: Create the completions table for Planless V2

CREATE TABLE completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status completion_status NOT NULL DEFAULT 'PENDING'::completion_status,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_plan_completion UNIQUE (plan_id)
);

-- Comments for documentation and clarity
COMMENT ON TABLE completions IS 'Stores completion status and activity outcomes of plans.';
COMMENT ON COLUMN completions.id IS 'Primary key.';
COMMENT ON COLUMN completions.plan_id IS 'The plan associated with this completion.';
COMMENT ON COLUMN completions.status IS 'Completion status lifecycle (PENDING, SUBMITTED, VERIFIED).';
COMMENT ON COLUMN completions.data IS 'Activity-agnostic JSONB payload storing specific activity results (MVP, scores, rating, etc.).';
COMMENT ON COLUMN completions.completed_at IS 'Timestamp when the completion was submitted by the host.';
COMMENT ON COLUMN completions.created_at IS 'Timestamp when the completion record was created.';
COMMENT ON COLUMN completions.updated_at IS 'Timestamp when the completion record was last updated.';

-- Application Workflow:
-- 1. When a plan finishes, the application creates a completion record:
--    status = 'PENDING'
-- 2. When the host submits the completion data:
--    status = 'SUBMITTED', completed_at = now()
-- 3. After verification by the backend or participants:
--    status = 'VERIFIED'
-- Note: The JSONB `data` structure depends on the plan subcategory (e.g. {mvp: uuid, goals: []} for Football).
