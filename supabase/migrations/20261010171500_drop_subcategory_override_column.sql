-- Migration: Drop unused column subcategory_override from discovery_place_overrides
-- Reason: 100% NULL across all production rows; redundant with active 'subcategory' column.

ALTER TABLE public.discovery_place_overrides
DROP COLUMN IF EXISTS subcategory_override;
