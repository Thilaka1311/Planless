-- Migration: 20260907120000_drop_legacy_circle_artifacts
-- Description: Drop confirmed orphaned Circle database artifacts (functions, column, and enum)

-- 1. Drop orphaned Circle functions
DROP FUNCTION IF EXISTS public.transfer_circle_ownership(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.check_circle_host_invariant();
DROP FUNCTION IF EXISTS public.generate_circle_public_id();

-- 2. Drop orphaned circle_id column from plan_participants
ALTER TABLE IF EXISTS public.plan_participants DROP COLUMN IF EXISTS circle_id;

-- 3. Drop orphaned circle_role enum
DROP TYPE IF EXISTS public.circle_role;
