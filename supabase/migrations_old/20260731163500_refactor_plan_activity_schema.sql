-- Migration: 20260731163500_refactor_plan_activity_schema.sql
-- Description: Refactor plan_activity table to remove updated_at and make actor_id nullable for system actions.

-- 1. DROP UPDATED_AT COLUMN
ALTER TABLE public.plan_activity DROP COLUMN IF EXISTS updated_at;

-- 2. MAKE ACTOR_ID NULLABLE
ALTER TABLE public.plan_activity ALTER COLUMN actor_id DROP NOT NULL;

-- 3. UPDATE COMMENTS
COMMENT ON COLUMN public.plan_activity.actor_id IS 'The user who performed the activity (references public.users.id). Nullable for system-generated actions.';
COMMENT ON COLUMN public.plan_activity.created_at IS 'Immutable timestamp when the activity occurred.';
