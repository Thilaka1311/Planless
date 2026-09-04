-- Migration: 033_add_cover_image_to_plans
-- Description: Add cover_image column to plans table to support custom cover images

ALTER TABLE plans ADD COLUMN cover_image TEXT;

COMMENT ON COLUMN plans.cover_image IS 'Custom cover image URL selected by the host.';
