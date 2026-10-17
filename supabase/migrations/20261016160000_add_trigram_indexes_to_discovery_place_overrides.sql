-- Migration: Add trigram and category indexes to discovery_place_overrides
-- Description: Accelerates text search (ILIKE '%...%') and category filtering on curated place overrides

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Category filtering index for active records
CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_cat
    ON public.discovery_place_overrides (category_override)
    WHERE is_deleted = false;

-- Trigram GIN indexes for fast ILIKE search across candidate name, address, and subcategory
CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_name_trgm
    ON public.discovery_place_overrides USING gin (name_override gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_addr_trgm
    ON public.discovery_place_overrides USING gin (address_override gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_subcat_trgm
    ON public.discovery_place_overrides USING gin (subcategory gin_trgm_ops);
