-- Migration: Add discovery_place_overrides table and is_deleted column
-- Description: Establishes place overrides table with admin curation and place exclusion support.

CREATE TABLE IF NOT EXISTS public.discovery_place_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    place_id text NOT NULL,
    name_override text,
    address_override text,
    latitude_override double precision,
    longitude_override double precision,
    image_path text,
    image_source text,
    google_photo_reference text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description_override text,
    category_override text,
    provider text DEFAULT 'google_places'::text NOT NULL,
    subcategory_override text,
    subcategory text,
    is_deleted boolean DEFAULT false NOT NULL
);

-- Ensure unique constraint on place_id (one override row per Google place_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'discovery_place_overrides_place_id_key'
    ) THEN
        ALTER TABLE public.discovery_place_overrides
            ADD CONSTRAINT discovery_place_overrides_place_id_key UNIQUE (place_id);
    END IF;
END $$;

-- Fast index on place_id for lookup and exclusion filtering
CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_place_id ON public.discovery_place_overrides (place_id);
CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_is_deleted ON public.discovery_place_overrides (is_deleted);

-- Enable RLS
ALTER TABLE public.discovery_place_overrides ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'discovery_place_overrides' AND policyname = 'Public read discovery place overrides'
    ) THEN
        CREATE POLICY "Public read discovery place overrides" ON public.discovery_place_overrides FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'discovery_place_overrides' AND policyname = 'Admins can insert discovery place overrides'
    ) THEN
        CREATE POLICY "Admins can insert discovery place overrides" ON public.discovery_place_overrides FOR INSERT TO authenticated WITH CHECK (
            EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'::public.user_role)
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'discovery_place_overrides' AND policyname = 'Admins can update discovery place overrides'
    ) THEN
        CREATE POLICY "Admins can update discovery place overrides" ON public.discovery_place_overrides FOR UPDATE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'::public.user_role)
        ) WITH CHECK (
            EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'::public.user_role)
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'discovery_place_overrides' AND policyname = 'Admins can delete discovery place overrides'
    ) THEN
        CREATE POLICY "Admins can delete discovery place overrides" ON public.discovery_place_overrides FOR DELETE TO authenticated USING (
            EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin'::public.user_role)
        );
    END IF;
END $$;

GRANT ALL ON TABLE public.discovery_place_overrides TO anon;
GRANT ALL ON TABLE public.discovery_place_overrides TO authenticated;
GRANT ALL ON TABLE public.discovery_place_overrides TO service_role;
