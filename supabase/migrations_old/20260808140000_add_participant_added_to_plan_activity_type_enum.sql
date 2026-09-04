-- ============================================================
-- Migration: Add participant_added to plan_activity_type enum
-- ============================================================

ALTER TYPE public.plan_activity_type ADD VALUE IF NOT EXISTS 'participant_added';
