-- Add 'CUSTOM' to the public.activity_category enum type.
-- This operation is safe to execute on existing databases and avoids errors if the value already exists.
ALTER TYPE public.activity_category ADD VALUE IF NOT EXISTS 'CUSTOM';
