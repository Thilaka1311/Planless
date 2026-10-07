-- ==============================================================================
-- Migration: 20260928160000_create_quick_plans.sql
-- Description: Creates quick_plans and quick_plan_participants tables with RLS
-- ==============================================================================

-- 1. Create quick_plans table
CREATE TABLE IF NOT EXISTS public.quick_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'CUSTOM',
    subcategory TEXT DEFAULT 'OTHER',
    place_id TEXT,
    place_name TEXT NOT NULL DEFAULT '',
    place_address TEXT NOT NULL DEFAULT '',
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    cover_image TEXT,
    default_cost NUMERIC(10,2) DEFAULT 0 NOT NULL,
    plan_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT check_quick_plan_name CHECK (length(trim(both from name)) > 0)
);

ALTER TABLE public.quick_plans OWNER TO postgres;

-- 2. Create quick_plan_participants table
CREATE TABLE IF NOT EXISTS public.quick_plan_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quick_plan_id UUID NOT NULL REFERENCES public.quick_plans(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT quick_plan_participants_unique_user UNIQUE (quick_plan_id, user_id)
);

ALTER TABLE public.quick_plan_participants OWNER TO postgres;

-- 3. Enable RLS
ALTER TABLE public.quick_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_plan_participants ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies on quick_plans (scoped strictly to creator_id = auth.uid())
CREATE POLICY "Users can select their own quick plans"
    ON public.quick_plans FOR SELECT TO authenticated
    USING (auth.uid() = creator_id);

CREATE POLICY "Users can insert their own quick plans"
    ON public.quick_plans FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own quick plans"
    ON public.quick_plans FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id)
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own quick plans"
    ON public.quick_plans FOR DELETE TO authenticated
    USING (auth.uid() = creator_id);

-- 5. RLS policies on quick_plan_participants (tied to owning quick plan's creator_id = auth.uid())
CREATE POLICY "Users can view participants of their own quick plans"
    ON public.quick_plan_participants FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quick_plans
        WHERE public.quick_plans.id = quick_plan_participants.quick_plan_id
        AND public.quick_plans.creator_id = auth.uid()
    ));

CREATE POLICY "Users can insert participants for their own quick plans"
    ON public.quick_plan_participants FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quick_plans
        WHERE public.quick_plans.id = quick_plan_participants.quick_plan_id
        AND public.quick_plans.creator_id = auth.uid()
    ));

CREATE POLICY "Users can update participants for their own quick plans"
    ON public.quick_plan_participants FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quick_plans
        WHERE public.quick_plans.id = quick_plan_participants.quick_plan_id
        AND public.quick_plans.creator_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.quick_plans
        WHERE public.quick_plans.id = quick_plan_participants.quick_plan_id
        AND public.quick_plans.creator_id = auth.uid()
    ));

CREATE POLICY "Users can delete participants from their own quick plans"
    ON public.quick_plan_participants FOR DELETE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.quick_plans
        WHERE public.quick_plans.id = quick_plan_participants.quick_plan_id
        AND public.quick_plans.creator_id = auth.uid()
    ));

-- 6. High-performance indexes
CREATE INDEX IF NOT EXISTS idx_quick_plans_creator_id ON public.quick_plans(creator_id);
CREATE INDEX IF NOT EXISTS idx_quick_plan_participants_qp_id ON public.quick_plan_participants(quick_plan_id);
CREATE INDEX IF NOT EXISTS idx_quick_plan_participants_user_id ON public.quick_plan_participants(user_id);
