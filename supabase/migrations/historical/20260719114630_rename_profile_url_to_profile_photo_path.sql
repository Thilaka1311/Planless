-- Migration: Rename profile_url to profile_photo_path in users table
ALTER TABLE public.users RENAME COLUMN profile_url TO profile_photo_path;
