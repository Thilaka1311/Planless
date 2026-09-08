-- Migration: 007_create_teams
-- Description: Create the plan_teams and team_members tables for Planless V2

CREATE TABLE plan_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  team team_type NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_plan_team UNIQUE (plan_id, team),
  CONSTRAINT check_team_name CHECK (length(trim(name)) > 0)
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES plan_teams(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES plan_participants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_team_participant UNIQUE (participant_id)
);

-- Comments for documentation and clarity (plan_teams)
COMMENT ON TABLE plan_teams IS 'Teams organized within a specific plan.';
COMMENT ON COLUMN plan_teams.id IS 'Primary key.';
COMMENT ON COLUMN plan_teams.plan_id IS 'The plan the team belongs to.';
COMMENT ON COLUMN plan_teams.team IS 'The underlying enum value representing the team (TEAM_1, TEAM_2).';
COMMENT ON COLUMN plan_teams.name IS 'The display name of the team, customizable by the host.';
COMMENT ON COLUMN plan_teams.created_at IS 'Timestamp when the team was created.';
COMMENT ON COLUMN plan_teams.updated_at IS 'Timestamp when the team was last updated.';

-- Comments for documentation and clarity (team_members)
COMMENT ON TABLE team_members IS 'Association of plan participants to specific teams.';
COMMENT ON COLUMN team_members.id IS 'Primary key.';
COMMENT ON COLUMN team_members.team_id IS 'The team the participant belongs to.';
COMMENT ON COLUMN team_members.participant_id IS 'The plan participant assigned to the team.';
COMMENT ON COLUMN team_members.created_at IS 'Timestamp when the participant was assigned to the team.';

-- Application Workflow Documentation:
-- 1. Team Creation:
--    When a team-based plan is created, the application automatically creates two team rows:
--    - team = 'TEAM_1', name = 'Team 1'
--    - team = 'TEAM_2', name = 'Team 2'
--    Only the 'name' field is modified if the host decides to customize the team names later (e.g., TEAM_1 -> "Red Dragons").
-- 2. Team Assignment:
--    - A participant may belong to only one team (guaranteed by unique_team_participant constraint).
--    - When moving a participant to another team, the application should update the team_id on the existing team_members row instead of creating a new row.
