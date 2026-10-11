-- Migration: Drop public.memories table
-- Reason: Table has 0 rows in production, 0 inbound foreign keys, 0 active database functions.
-- Prototype feature replaced by in-memory derived plan info.
-- Note: CASCADE is strictly omitted to safeguard against unknown dependencies.

DROP TABLE IF EXISTS public.memories;
