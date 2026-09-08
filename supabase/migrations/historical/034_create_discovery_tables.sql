-- Create discovery_sections table
CREATE TABLE IF NOT EXISTS public.discovery_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL, -- e.g., 'for_you', 'sports', 'movies', 'dining', 'drinks'
    section_name TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create discovery_items table
CREATE TABLE IF NOT EXISTS public.discovery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT UNIQUE NOT NULL,
    section_id UUID REFERENCES public.discovery_sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    description TEXT,
    cover_image TEXT,
    location TEXT,
    suggested_duration INTEGER, -- in minutes
    suggested_cost NUMERIC DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.discovery_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_items ENABLE ROW LEVEL SECURITY;

-- Select policies (Allow anyone to read)
CREATE POLICY "Allow public read access on discovery_sections" 
ON public.discovery_sections FOR SELECT USING (true);

CREATE POLICY "Allow public read access on discovery_items" 
ON public.discovery_items FOR SELECT USING (true);

-- Insert Seed Data
DO $$
DECLARE
    sec_foryou1_id UUID;
    sec_sports1_id UUID;
    sec_movies1_id UUID;
    sec_dining1_id UUID;
    sec_drinks1_id UUID;
BEGIN
    -- 1. Create sections
    INSERT INTO public.discovery_sections (category, section_name, display_order)
    VALUES ('for_you', 'Trending Near You', 1)
    RETURNING id INTO sec_foryou1_id;

    INSERT INTO public.discovery_sections (category, section_name, display_order)
    VALUES ('sports', 'Curated Sports Matches', 1)
    RETURNING id INTO sec_sports1_id;

    INSERT INTO public.discovery_sections (category, section_name, display_order)
    VALUES ('movies', 'Trending Movies', 1)
    RETURNING id INTO sec_movies1_id;

    INSERT INTO public.discovery_sections (category, section_name, display_order)
    VALUES ('dining', 'Top Dining Choices', 1)
    RETURNING id INTO sec_dining1_id;

    INSERT INTO public.discovery_sections (category, section_name, display_order)
    VALUES ('drinks', 'Curated Nightlife & Drinks', 1)
    RETURNING id INTO sec_drinks1_id;

    -- 2. Insert items for For You
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order, is_featured)
    VALUES (
        'item_hsr_football',
        sec_foryou1_id,
        'HSR Turf Football',
        'sports',
        'football',
        'Casual 5v5 friendly game on turf',
        '/assets/plan-covers/football.png',
        'HSR Play Arena, Bangalore',
        90,
        150,
        1,
        true
    );

    -- 3. Insert items for Sports
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order)
    VALUES (
        'item_sports_football',
        sec_sports1_id,
        'Football Turf Match',
        'sports',
        'football',
        'Weekend 7v7 friendly football game',
        '/assets/plan-covers/football.png',
        'Play Arena Turf HSR',
        90,
        120,
        1
    );
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order)
    VALUES (
        'item_sports_badminton',
        sec_sports1_id,
        'Badminton singles / doubles',
        'sports',
        'badminton',
        'Indoor synthetic court play session',
        '/assets/plan-covers/badminton.png',
        'Navkis Indoor Arena',
        60,
        100,
        2
    );

    -- 4. Insert items for Movies
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order)
    VALUES (
        'item_movies_imax',
        sec_movies1_id,
        'IMAX Premiere Night',
        'movies',
        'action',
        'Latest cinematic blockbuster release',
        '/assets/plan-covers/movie.png',
        'Nexus IMAX Koramangala',
        150,
        350,
        1
    );

    -- 5. Insert items for Dining
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order)
    VALUES (
        'item_dining_toit',
        sec_dining1_id,
        'Gourmet Brewery Dinner',
        'dining',
        'brewery',
        'Toit wood-fired pizzas & craft brews',
        '/assets/plan-covers/dining.png',
        'Toit, Indiranagar',
        120,
        800,
        1
    );

    -- 6. Insert items for Drinks
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image, location, suggested_duration, suggested_cost, display_order)
    VALUES (
        'item_drinks_social',
        sec_drinks1_id,
        'Rooftop Cocktails',
        'drinks',
        'cocktails',
        'Signature drinks with panoramic cityscape views',
        '/assets/plan-covers/dining.png',
        'Social Rooftop HSR',
        180,
        500,
        1
    );
END $$;
