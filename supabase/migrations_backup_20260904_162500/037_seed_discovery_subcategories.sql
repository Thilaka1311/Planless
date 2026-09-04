-- Migration: 037_seed_discovery_subcategories
-- Description: Update existing discovery items and insert additional items with valid subcategories/languages/dining types for dynamic grouping

-- Update existing items to match new subcategory values
UPDATE public.discovery_items 
SET subcategory = 'ENGLISH'
WHERE public_id = 'DISC000003' OR title = 'IMAX Premiere Night';

UPDATE public.discovery_items 
SET subcategory = 'RESTOBARS'
WHERE public_id = 'DISC000004' OR title = 'Gourmet Brewery Dinner';

-- Get sections ids safely
DO $$
DECLARE
    sec_movies_id UUID;
    sec_dining_id UUID;
BEGIN
    SELECT id INTO sec_movies_id FROM public.discovery_sections WHERE category = 'MOVIES' LIMIT 1;
    SELECT id INTO sec_dining_id FROM public.discovery_sections WHERE category = 'DINING' LIMIT 1;

    -- Add Bollywood blockbuster to HINDI movies
    IF sec_movies_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.discovery_items WHERE title = 'Bollywood Blockbuster') THEN
        INSERT INTO public.discovery_items (section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
        VALUES (
            sec_movies_id,
            'Bollywood Blockbuster',
            'MOVIES',
            'HINDI',
            'Catch the latest Bollywood musical thriller',
            '/assets/plan-covers/movie.png',
            'PVR Director Cut, Forum Mall',
            160,
            250,
            6,
            2
        );
    END IF;

    -- Add Kannada movie
    IF sec_movies_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.discovery_items WHERE title = 'Sandalwood Premiere') THEN
        INSERT INTO public.discovery_items (section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
        VALUES (
            sec_movies_id,
            'Sandalwood Premiere',
            'MOVIES',
            'KANNADA',
            'New release Sandalwood movie screening',
            '/assets/plan-covers/movie.png',
            'Veeresh Cinemas',
            140,
            150,
            8,
            3
        );
    END IF;

    -- Add Cafe to Dining
    IF sec_dining_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.discovery_items WHERE title = 'Cozy Corner Cafe') THEN
        INSERT INTO public.discovery_items (section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
        VALUES (
            sec_dining_id,
            'Cozy Corner Cafe',
            'DINING',
            'CAFES',
            'Artisanal coffee and fresh bakery items',
            '/assets/plan-covers/dining.png',
            'Third Wave Coffee, Koramangala',
            90,
            200,
            4,
            2
        );
    END IF;

    -- Add Family Restaurant to Dining
    IF sec_dining_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.discovery_items WHERE title = 'Golden Leaf Family Buffet') THEN
        INSERT INTO public.discovery_items (section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
        VALUES (
            sec_dining_id,
            'Golden Leaf Family Buffet',
            'DINING',
            'FAMILY_RESTAURANTS',
            'Grand royal buffet dining with family',
            '/assets/plan-covers/dining.png',
            'Barbeque Nation, Indiranagar',
            120,
            900,
            12,
            3
        );
    END IF;
END $$;
