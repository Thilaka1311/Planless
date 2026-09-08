-- Drop existing tables to recreate with clean types and enums
DROP TABLE IF EXISTS public.discovery_items CASCADE;
DROP TABLE IF EXISTS public.discovery_sections CASCADE;

-- Create custom enum types
CREATE TYPE public.discovery_category AS ENUM (
    'SPORTS',
    'MOVIES',
    'DINING',
    'DRINKS',
    'CUSTOM',
    'QUICK_PLAN'
);

CREATE TYPE public.discovery_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED'
);

CREATE TYPE public.sports_subcategory AS ENUM (
    'FOOTBALL',
    'BADMINTON',
    'CRICKET',
    'BASKETBALL',
    'TENNIS',
    'PICKLEBALL',
    'VOLLEYBALL',
    'TABLE_TENNIS'
);

CREATE TYPE public.movie_genre AS ENUM (
    'ACTION',
    'COMEDY',
    'DRAMA',
    'THRILLER',
    'HORROR',
    'ROMANCE',
    'SCI_FI',
    'ANIMATION',
    'DOCUMENTARY'
);

CREATE TYPE public.dining_type AS ENUM (
    'CAFE',
    'RESTAURANT',
    'BREWERY',
    'BUFFET',
    'FAST_FOOD',
    'DESSERT',
    'FINE_DINING',
    'STREET_FOOD'
);

CREATE TYPE public.drinks_type AS ENUM (
    'BAR',
    'PUB',
    'BREWERY',
    'LOUNGE',
    'COCKTAIL_BAR',
    'WINE_BAR',
    'CAFE'
);

-- Create normalized discovery_sections table
CREATE TABLE public.discovery_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT UNIQUE NOT NULL,
    category public.discovery_category NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    display_order INTEGER DEFAULT 0,
    status public.discovery_status DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create normalized discovery_items table
CREATE TABLE public.discovery_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id TEXT UNIQUE NOT NULL,
    section_id UUID REFERENCES public.discovery_sections(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category public.discovery_category NOT NULL,
    subcategory TEXT, -- Holds string value matching subcategory/genre/type enums
    description TEXT,
    cover_image_url TEXT,
    location TEXT,
    suggested_duration_minutes INTEGER,
    suggested_cost_amount NUMERIC DEFAULT 0,
    suggested_capacity INTEGER,
    default_rsvp_offset_minutes INTEGER DEFAULT 60,
    display_order INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT false,
    status public.discovery_status DEFAULT 'ACTIVE' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.discovery_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_items ENABLE ROW LEVEL SECURITY;

-- Select policies
CREATE POLICY "Allow public read access on discovery_sections" 
ON public.discovery_sections FOR SELECT USING (true);

CREATE POLICY "Allow public read access on discovery_items" 
ON public.discovery_items FOR SELECT USING (true);

-- Insert Seed Data (Sports, Movies, Dining, Drinks)
DO $$
DECLARE
    sec_sports1_id UUID;
    sec_movies1_id UUID;
    sec_dining1_id UUID;
    sec_drinks1_id UUID;
BEGIN
    -- 1. Create sections
    INSERT INTO public.discovery_sections (public_id, category, title, description, display_order)
    VALUES ('sec_sports_curated', 'SPORTS', 'Curated Sports Matches', 'Curated matches to book with friends', 1)
    RETURNING id INTO sec_sports1_id;

    INSERT INTO public.discovery_sections (public_id, category, title, description, display_order)
    VALUES ('sec_movies_curated', 'MOVIES', 'Trending Movies', 'Curated movies to watch in theatres', 1)
    RETURNING id INTO sec_movies1_id;

    INSERT INTO public.discovery_sections (public_id, category, title, description, display_order)
    VALUES ('sec_dining_curated', 'DINING', 'Top Dining Choices', 'Curated restaurants and cafes near you', 1)
    RETURNING id INTO sec_dining1_id;

    INSERT INTO public.discovery_sections (public_id, category, title, description, display_order)
    VALUES ('sec_drinks_curated', 'DRINKS', 'Curated Nightlife & Drinks', 'Trending bars, pubs and breweries', 1)
    RETURNING id INTO sec_drinks1_id;

    -- 2. Insert items for Sports
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
    VALUES (
        'item_sports_football',
        sec_sports1_id,
        'Football Turf Match',
        'SPORTS',
        'FOOTBALL',
        'Weekend 7v7 friendly football game',
        '/assets/plan-covers/football.png',
        'Play Arena Turf HSR',
        90,
        120,
        14,
        1
    );
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
    VALUES (
        'item_sports_badminton',
        sec_sports1_id,
        'Badminton singles / doubles',
        'SPORTS',
        'BADMINTON',
        'Indoor synthetic court play session',
        '/assets/plan-covers/badminton.png',
        'Navkis Indoor Arena',
        60,
        100,
        4,
        2
    );

    -- 3. Insert items for Movies
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
    VALUES (
        'item_movies_imax',
        sec_movies1_id,
        'IMAX Premiere Night',
        'MOVIES',
        'ACTION',
        'Latest cinematic blockbuster release',
        '/assets/plan-covers/movie.png',
        'Nexus IMAX Koramangala',
        150,
        350,
        5,
        1
    );

    -- 4. Insert items for Dining
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
    VALUES (
        'item_dining_toit',
        sec_dining1_id,
        'Gourmet Brewery Dinner',
        'DINING',
        'BREWERY',
        'Toit wood-fired pizzas & craft brews',
        '/assets/plan-covers/dining.png',
        'Toit, Indiranagar',
        120,
        800,
        6,
        1
    );

    -- 5. Insert items for Drinks
    INSERT INTO public.discovery_items (public_id, section_id, title, category, subcategory, description, cover_image_url, location, suggested_duration_minutes, suggested_cost_amount, suggested_capacity, display_order)
    VALUES (
        'item_drinks_social',
        sec_drinks1_id,
        'Rooftop Cocktails',
        'DRINKS',
        'COCKTAIL_BAR',
        'Signature drinks with panoramic cityscape views',
        '/assets/plan-covers/dining.png',
        'Social Rooftop HSR',
        180,
        500,
        8,
        1
    );
END $$;
