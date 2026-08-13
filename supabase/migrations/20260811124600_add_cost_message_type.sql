-- Migration: Add 'cost' to message_type enum and update plan_messages constraint

ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'cost';

ALTER TABLE public.plan_messages DROP CONSTRAINT IF EXISTS check_system_message_type_invariant;

ALTER TABLE public.plan_messages ADD CONSTRAINT check_system_message_type_invariant CHECK (
  (message_type = 'system' AND system_message_type IS NOT NULL) OR
  (message_type IN ('text', 'poll', 'cost') AND system_message_type IS NULL)
);
