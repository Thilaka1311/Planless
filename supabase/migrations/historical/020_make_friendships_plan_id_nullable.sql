-- Migration: 020_make_friendships_plan_id_nullable
-- Description: Drop NOT NULL constraint on created_from_plan_id to allow friendship connections outside plans (e.g. circle memberships)

ALTER TABLE friendships ALTER COLUMN created_from_plan_id DROP NOT NULL;
