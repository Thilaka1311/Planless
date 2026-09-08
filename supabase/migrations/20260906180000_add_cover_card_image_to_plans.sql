-- Migration: add_cover_card_image_to_plans
-- Adds a separate column for the cropped Home Plan Card portrait image.
-- When NULL, PlanCard falls back to cover_image (backward-compatible).

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS cover_card_image TEXT DEFAULT NULL;

COMMENT ON COLUMN plans.cover_card_image IS
  'Path to the cropped 9:16 portrait image used on the Home Plan Card. '
  'Falls back to cover_image when NULL. The cover_image field always holds the original full image.';
