-- Create PostgreSQL enum types for subcategories if they do not exist
CREATE TYPE public.sports_subcategory_enum AS ENUM ('FOOTBALL', 'BADMINTON', 'PICKLEBALL');
CREATE TYPE public.movies_subcategory_enum AS ENUM ('ENGLISH', 'TAMIL', 'HINDI');
CREATE TYPE public.dining_subcategory_enum AS ENUM ('CAFE', 'PUB', 'FINE_DINE');

-- Safe migration of existing rows in discovery_items to map them to the new schema:
-- If category is SPORTS and subcategory is not one of FOOTBALL, BADMINTON, PICKLEBALL, default to NULL or map where possible.
UPDATE public.discovery_items
SET subcategory = NULL
WHERE category = 'SPORTS' AND subcategory NOT IN ('FOOTBALL', 'BADMINTON', 'PICKLEBALL');

UPDATE public.discovery_items
SET subcategory = NULL
WHERE category = 'MOVIES' AND subcategory NOT IN ('ENGLISH', 'TAMIL', 'HINDI');

UPDATE public.discovery_items
SET subcategory = NULL
WHERE category = 'DINING' AND subcategory NOT IN ('CAFE', 'PUB', 'FINE_DINE');

UPDATE public.discovery_items
SET subcategory = NULL
WHERE category = 'CUSTOM';

-- Add a subcategory column to discovery_sections table
ALTER TABLE public.discovery_sections ADD COLUMN IF NOT EXISTS subcategory TEXT;

-- Enforce CHECK constraints on discovery_items category/subcategory relationships
ALTER TABLE public.discovery_items DROP CONSTRAINT IF EXISTS chk_discovery_subcategory_rules;
ALTER TABLE public.discovery_items ADD CONSTRAINT chk_discovery_subcategory_rules CHECK (
  (category = 'SPORTS' AND subcategory IN ('FOOTBALL', 'BADMINTON', 'PICKLEBALL')) OR
  (category = 'MOVIES' AND subcategory IN ('ENGLISH', 'TAMIL', 'HINDI')) OR
  (category = 'DINING' AND subcategory IN ('CAFE', 'PUB', 'FINE_DINE')) OR
  (category = 'CUSTOM' AND subcategory IS NULL) OR
  (category NOT IN ('SPORTS', 'MOVIES', 'DINING', 'CUSTOM'))
);
