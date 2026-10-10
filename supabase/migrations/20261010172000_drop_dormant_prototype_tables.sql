-- Migration: Drop dormant prototype tables and associated types
-- Tables: memory_results, plan_outcomes, plan_team_assignments, notifications
-- Types: notification_type, team_type
-- Reason: Tables have 0 rows in production, 0 inbound foreign keys, 0 active database functions,
-- and are either commented out or managed purely in-memory in client state.

DROP TABLE IF EXISTS public.memory_results CASCADE;
DROP TABLE IF EXISTS public.plan_outcomes CASCADE;
DROP TABLE IF EXISTS public.plan_team_assignments CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;

DROP TYPE IF EXISTS public.notification_type CASCADE;
DROP TYPE IF EXISTS public.team_type CASCADE;
