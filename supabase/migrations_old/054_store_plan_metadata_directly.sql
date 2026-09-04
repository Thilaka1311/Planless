-- Migration: 054_store_plan_metadata_directly
-- Description: Add category, subcategory, cover_image_url, and location columns to plans table and migrate existing data.

-- 1. Add columns to plans table
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS location TEXT;

-- 2. Migrate existing plans with discovery_item_id by copying metadata from discovery_items
UPDATE public.plans p
SET 
  category = d.category::text,
  subcategory = d.subcategory,
  cover_image_url = d.cover_image_url,
  location = d.location
FROM public.discovery_items d
WHERE p.discovery_item_id = d.id;

-- 3. Migrate custom plans (no discovery_item_id) using their existing plan values
UPDATE public.plans
SET 
  category = 'custom',
  subcategory = 'other',
  cover_image_url = cover_image,
  location = place_name
WHERE discovery_item_id IS NULL;
