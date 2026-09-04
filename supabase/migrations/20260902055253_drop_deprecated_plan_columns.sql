-- Description: Remove deprecated columns (description, cover_image_url, location, circle_id) from public.plans table.

ALTER TABLE public.plans 
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS cover_image_url,
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS circle_id;
