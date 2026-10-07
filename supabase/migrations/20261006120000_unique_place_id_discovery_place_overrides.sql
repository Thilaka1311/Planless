-- Migration: Enforce unique constraint on place_id for discovery_place_overrides
-- Ensures one override row per Google place_id and enables onConflict: "place_id" upserts.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'discovery_place_overrides_place_id_subcategory_key'
    ) THEN
        ALTER TABLE public.discovery_place_overrides
            DROP CONSTRAINT discovery_place_overrides_place_id_subcategory_key;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'discovery_place_overrides_place_id_key'
    ) THEN
        ALTER TABLE public.discovery_place_overrides
            ADD CONSTRAINT discovery_place_overrides_place_id_key UNIQUE (place_id);
    END IF;
END $$;
