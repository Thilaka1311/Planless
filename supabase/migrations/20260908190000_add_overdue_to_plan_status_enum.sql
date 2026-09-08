-- ============================================================
-- Migration: Add OVERDUE to plan_status enum
-- ============================================================

ALTER TYPE "public"."plan_status" ADD VALUE IF NOT EXISTS 'OVERDUE' BEFORE 'COMPLETED';
