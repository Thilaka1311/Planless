-- Migration: 029_add_circle_details_columns
-- Description: Add description and cover_image columns to the circles table

ALTER TABLE circles 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS cover_image TEXT;

COMMENT ON COLUMN circles.description IS 'Optional description/bio of the circle.';
COMMENT ON COLUMN circles.cover_image IS 'URL to the circle profile picture/cover image.';
