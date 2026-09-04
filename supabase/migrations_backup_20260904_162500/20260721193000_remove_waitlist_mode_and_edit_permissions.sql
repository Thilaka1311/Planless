-- ============================================================================
-- Migration: Remove waitlist_mode and edit_permissions
-- Description: Drops columns and PostgreSQL ENUM types for waitlist_mode and
--              edit_permissions to simplify Plan Settings for MVP.
-- ============================================================================

ALTER TABLE public.plans DROP COLUMN IF EXISTS waitlist_mode;
ALTER TABLE public.plans DROP COLUMN IF EXISTS edit_permissions;

DROP TYPE IF EXISTS public.plan_waitlist_mode;
DROP TYPE IF EXISTS public.plan_edit_permissions;
