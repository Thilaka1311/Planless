-- Migration: 20260926191500_add_idx_plan_participants_user_id.sql
-- Description: Add missing index on plan_participants(user_id) to accelerate user-filtered queries.

CREATE INDEX IF NOT EXISTS idx_plan_participants_user_id
ON public.plan_participants(user_id);
