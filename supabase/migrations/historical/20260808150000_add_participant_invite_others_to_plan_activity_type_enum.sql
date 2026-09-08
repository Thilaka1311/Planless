-- ============================================================
-- Migration: Add participant_invite_others to plan_activity_type enum
-- ============================================================

ALTER TYPE public.plan_activity_type ADD VALUE IF NOT EXISTS 'participant_invite_others';
