-- Migration: Convert legacy profile URLs to relative storage paths
UPDATE public.users
SET profile_url = id || '/avatar.jpg'
WHERE profile_url IS NOT NULL 
  AND (profile_url LIKE 'http%' OR profile_url LIKE '/storage/%');
