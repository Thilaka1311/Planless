-- Migration: Enable Supabase Realtime for discovery_place_overrides
-- Ensures live pub/sub sync across clients when place overrides (photos, details, exclusions) are updated.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'discovery_place_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.discovery_place_overrides;
  END IF;

  -- Ensure all column changes are available in Realtime payloads on updates
  ALTER TABLE public.discovery_place_overrides REPLICA IDENTITY FULL;
END $$;
