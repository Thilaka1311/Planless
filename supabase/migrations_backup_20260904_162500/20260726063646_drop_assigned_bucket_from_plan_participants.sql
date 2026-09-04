-- Migration: Drop assigned_bucket column from plan_participants table
-- Description: Removes redundant assigned_bucket column, keeping assigned_group as the canonical field.

ALTER TABLE public.plan_participants
DROP COLUMN IF EXISTS assigned_bucket;
