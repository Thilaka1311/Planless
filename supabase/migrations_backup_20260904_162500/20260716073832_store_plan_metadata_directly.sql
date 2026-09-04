-- Migration: store_plan_metadata_directly
-- Description: Add category, subcategory, cover_image_url, and location to plans table and migrate existing data.

-- 1. Add columns with default values so NOT NULL constraint is satisfied for existing rows
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS subcategory TEXT NOT NULL DEFAULT 'OTHER';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS location TEXT;

-- 2. Migrate existing plans with discovery_item_id by copying from discovery_items
UPDATE public.plans p
SET
  category = di.category,
  subcategory = di.subcategory,
  cover_image_url = di.cover_image_url,
  location = di.location
FROM public.discovery_items di
WHERE p.discovery_item_id = di.id;

-- 3. Populate snapshot fields for custom plans (where discovery_item_id is NULL)
UPDATE public.plans
SET
  category = 'CUSTOM',
  subcategory = 'OTHER',
  cover_image_url = COALESCE(cover_image_url, cover_image),
  location = COALESCE(location, place_name)
WHERE discovery_item_id IS NULL;
