-- Migration: 049_add_google_maps_fields_to_plans_and_discovery
-- Description: Add place_id, latitude, and longitude columns to plans and discovery_items tables.

-- 1. Add coordinate and Google Maps fields to plans table if they do not exist
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.plans ALTER COLUMN place_id DROP NOT NULL;

-- 2. Add Google Maps fields and coordinates to discovery_items table if they do not exist
ALTER TABLE public.discovery_items ADD COLUMN IF NOT EXISTS place_id TEXT;
ALTER TABLE public.discovery_items ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE public.discovery_items ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE public.discovery_items ADD COLUMN IF NOT EXISTS place_name TEXT;
ALTER TABLE public.discovery_items ADD COLUMN IF NOT EXISTS place_address TEXT;

-- 3. Comments for documentation and clarity
COMMENT ON COLUMN public.plans.latitude IS 'The latitude coordinate resolved from Google Maps.';
COMMENT ON COLUMN public.plans.longitude IS 'The longitude coordinate resolved from Google Maps.';
COMMENT ON COLUMN public.discovery_items.place_id IS 'Google Maps Place ID representing the venue location.';
COMMENT ON COLUMN public.discovery_items.place_name IS 'Google Maps Place Name.';
COMMENT ON COLUMN public.discovery_items.place_address IS 'Google Maps Formatted Address.';
COMMENT ON COLUMN public.discovery_items.latitude IS 'The latitude coordinate resolved from Google Maps.';
COMMENT ON COLUMN public.discovery_items.longitude IS 'The longitude coordinate resolved from Google Maps.';
