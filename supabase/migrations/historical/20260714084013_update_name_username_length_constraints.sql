-- Migration: update_name_username_length_constraints
--
-- Summary of changes:
--   1. username: drop existing 30-char CHECK, add new 15-char CHECK
--   2. full_name: add new 40-char CHECK (no prior constraint existed)
--
-- NULL is allowed for both columns and is preserved as-is.
-- All other constraints (PK, FK, UNIQUE on public_id) are untouched.
-- Verified zero existing rows violate the new limits before applying.

-- ── 1. username ─────────────────────────────────────────────────────────────
-- Drop the old constraint (max 30 chars) that was added in migration 052.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS username_length_check;

-- Add the tighter constraint (max 15 chars) matching the frontend validation.
ALTER TABLE public.users
  ADD CONSTRAINT username_length_check
  CHECK (username IS NULL OR char_length(username) <= 15);

-- ── 2. full_name ─────────────────────────────────────────────────────────────
-- The full_name column had no length constraint. Add one matching the
-- frontend 40-character limit. NULL continues to be allowed.
ALTER TABLE public.users
  ADD CONSTRAINT full_name_length_check
  CHECK (full_name IS NULL OR char_length(full_name) <= 40);
