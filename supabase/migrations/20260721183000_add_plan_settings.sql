-- Migration: Add Plan Settings enums and columns to plans table
-- 1. Create Plan Waitlist Mode enum
CREATE TYPE public.plan_waitlist_mode AS ENUM ('automatic', 'manual');

-- 2. Create Plan Edit Permissions enum
CREATE TYPE public.plan_edit_permissions AS ENUM ('hosts_only', 'everyone');

-- 3. Update plans table
ALTER TABLE public.plans
  ADD COLUMN allow_participant_invites BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN waitlist_mode public.plan_waitlist_mode NOT NULL DEFAULT 'automatic',
  ADD COLUMN edit_permissions public.plan_edit_permissions NOT NULL DEFAULT 'hosts_only';
