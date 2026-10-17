-- Migration: Add city column, index, and coordinates to discovery_place_overrides
-- Description: Enforces strict city isolation for curated place overrides in Discovery feeds

-- 1. Add city column if not exists
ALTER TABLE public.discovery_place_overrides
    ADD COLUMN IF NOT EXISTS city TEXT;

-- 2. Fast index on city for active records
CREATE INDEX IF NOT EXISTS idx_discovery_place_overrides_city
    ON public.discovery_place_overrides (city)
    WHERE is_deleted = false;

-- 3. Assign verified city metadata to Chennai records
UPDATE public.discovery_place_overrides
SET city = 'Chennai'
WHERE place_id IN (
    'ChIJI-kfKwdnUjoRdgMMGQhpAfs', -- Kosmo cafe (Alwarpet, Chennai)
    'ChIJ-VFbD1X3UjoRnqpOc9oU5mE', -- Padmam Veg Restaurant (SRM Nagar, Chennai)
    'ChIJx3PrDG33UjoRB8IbmBdFklQ', -- Chennai exclusion marker
    'ChIJpcCR2Wz3UjoRGqHRdDaLpK8', -- Chennai exclusion marker
    'ChIJ3zClbAD3UjoRq-PtYz1c41g'  -- Chennai exclusion marker
);

-- 4. Assign verified city metadata to Bengaluru records
UPDATE public.discovery_place_overrides
SET city = 'Bengaluru'
WHERE city IS NULL;

-- 5. Backfill verified coordinates for the 10 Bengaluru records previously missing lat/lng
UPDATE public.discovery_place_overrides
SET latitude_override = 13.0249215, longitude_override = 77.6006645, city = 'Bengaluru'
WHERE place_id = 'ChIJPdIfb9kXrjsRFUD5p6R396w'; -- Aries Sports Arena (Hebbal)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.074947, longitude_override = 77.5554561, city = 'Bengaluru'
WHERE place_id = 'ChIJLy6-SSojrjsR1-rIqk9tkUw'; -- BBMP BASKETBALL COURT BASELINE ACADEMY (Vidyaranyapura)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0754757, longitude_override = 77.5561205, city = 'Bengaluru'
WHERE place_id = 'ChIJ1Xpbt_UjrjsRlUbNiEhjpcc'; -- Juno Sports (Vidyaranyapura)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.1380601, longitude_override = 77.567699, city = 'Bengaluru'
WHERE place_id = 'ChIJs4punsYZrjsR30-z9rruyXI'; -- The Game Changer (Avalahalli)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0630721, longitude_override = 77.5605469, city = 'Bengaluru'
WHERE place_id = 'ChIJj1S8LAAjrjsRhTbNB0LBlhM'; -- Vanasiri Badminton Arena (Doddabommasandra)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0606004, longitude_override = 77.5885566, city = 'Bengaluru'
WHERE place_id = 'ChIJJ4C4ty8ZrjsRkE5RJNEZH68'; -- Sahakara Nagara Basketball Court (Sahakar Nagar)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0602728, longitude_override = 77.5794059, city = 'Bengaluru'
WHERE place_id = 'ChIJZcb5wf0ZrjsR-qvNBCPDxew'; -- Sahakara Nagar Indoor Stadium (Sahakar Nagar)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0754757, longitude_override = 77.5561205, city = 'Bengaluru'
WHERE place_id = 'ChIJpU2GEqojrjsRFk7Fr5dAXoI'; -- BBMP Sports Comple (Vidyaranyapura)

UPDATE public.discovery_place_overrides
SET latitude_override = 13.0417052, longitude_override = 77.5561862, city = 'Bengaluru'
WHERE place_id = 'ChIJE98VJMQXrjsRcm7Wf1lruMo'; -- The Game Changer MSR (Mathikere)

UPDATE public.discovery_place_overrides
SET latitude_override = 12.9115037, longitude_override = 77.6763161, city = 'Bengaluru'
WHERE place_id = 'ChIJiSZlQ2ETrjsR7vGdNRrAOMg'; -- Go Kart Race Track, Play Arena (Haralur)
