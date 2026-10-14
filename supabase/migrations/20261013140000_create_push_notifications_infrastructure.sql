-- Migration: 20261013140000_create_push_notifications_infrastructure.sql
-- Description: Creates user_push_subscriptions and sent_plan_reminders tables.

-- 1. Create user_push_subscriptions table for multi-device Web Push subscriptions
CREATE TABLE IF NOT EXISTS public.user_push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    platform TEXT, -- 'ios', 'android', 'desktop'
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast recipient lookup during push broadcasts
CREATE INDEX IF NOT EXISTS idx_push_subs_user_active
ON public.user_push_subscriptions(user_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint
ON public.user_push_subscriptions(endpoint);

-- Enable Row Level Security
ALTER TABLE public.user_push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
ON public.user_push_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own push subscriptions"
ON public.user_push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
ON public.user_push_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own push subscriptions"
ON public.user_push_subscriptions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.user_push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.user_push_subscriptions TO service_role;

-- 4. Create sent_plan_reminders table to prevent duplicate scheduled reminders
CREATE TABLE IF NOT EXISTS public.sent_plan_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    reminder_type TEXT NOT NULL, -- e.g. '2_HOUR_BEFORE', '24_HOUR_BEFORE', 'RSVP_CLOSING'
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_plan_user_reminder UNIQUE (plan_id, user_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_sent_reminders_lookup
ON public.sent_plan_reminders(plan_id, reminder_type);

ALTER TABLE public.sent_plan_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sent reminders"
ON public.sent_plan_reminders
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

GRANT ALL ON TABLE public.sent_plan_reminders TO authenticated;
GRANT ALL ON TABLE public.sent_plan_reminders TO service_role;
