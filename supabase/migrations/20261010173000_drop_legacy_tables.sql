-- Migration: Drop legacy dormant tables and associated types
-- Tables: plan_activity, discovery_items, discovery_sections
-- Types: plan_activity_type, discovery_category, discovery_status
-- Reason: Tables have 0 rows in production, 0 inbound foreign keys, 0 active database functions,
-- and application code has been decoupled to use Google Places Edge Function and discovery_place_overrides.

DROP TABLE IF EXISTS public.plan_activity CASCADE;
DROP TABLE IF EXISTS public.discovery_items CASCADE;
DROP TABLE IF EXISTS public.discovery_sections CASCADE;

DROP TYPE IF EXISTS public.plan_activity_type CASCADE;
DROP TYPE IF EXISTS public.discovery_category CASCADE;
DROP TYPE IF EXISTS public.discovery_status CASCADE;
