-- Migration: 036_create_discovery_public_id_generator
-- Description: Create sequence and function to safely generate sequential discovery public IDs in format DISCXXXXXX

-- 1. Create sequence for discovery public IDs
CREATE SEQUENCE IF NOT EXISTS public.discovery_public_id_seq
  START WITH 1
  INCREMENT BY 1
  NO CYCLE;

-- 2. Create function to generate formatted discovery public IDs (e.g., DISC000001)
CREATE OR REPLACE FUNCTION public.generate_discovery_public_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_val BIGINT;
BEGIN
  next_val := nextval('public.discovery_public_id_seq');
  RETURN 'DISC' || lpad(next_val::text, 6, '0');
END;
$$;

-- 3. Set the default value for public_id column in discovery_items
ALTER TABLE public.discovery_items ALTER COLUMN public_id SET DEFAULT public.generate_discovery_public_id();

-- 4. Migrate existing items to new format in order of display_order/created_at
DO $$
DECLARE
    item_record RECORD;
    new_id TEXT;
BEGIN
    FOR item_record IN 
        SELECT id FROM public.discovery_items ORDER BY display_order ASC, created_at ASC
    LOOP
        new_id := public.generate_discovery_public_id();
        UPDATE public.discovery_items SET public_id = new_id WHERE id = item_record.id;
    END LOOP;
END $$;
