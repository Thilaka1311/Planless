-- ==============================================================================
-- Migration: 20260929090000_create_quick_plan_lists.sql
-- Description: Creates quick_plan_lists table, associates quick_plans to lists,
--              sets up RLS and cascade deletion.
-- ==============================================================================

-- 1. Create quick_plan_lists table
CREATE TABLE IF NOT EXISTS public.quick_plan_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT check_quick_plan_list_name CHECK (length(trim(both from name)) > 0)
);

ALTER TABLE public.quick_plan_lists OWNER TO postgres;

-- 2. Add quick_plan_list_id to quick_plans with CASCADE on delete
ALTER TABLE public.quick_plans 
ADD COLUMN IF NOT EXISTS quick_plan_list_id UUID REFERENCES public.quick_plan_lists(id) ON DELETE CASCADE;

-- 3. Backward compatibility: group any existing unlisted quick plans into a default 'Quick Plans' list
DO $$
DECLARE
    user_record RECORD;
    new_list_id UUID;
BEGIN
    FOR user_record IN 
        SELECT DISTINCT creator_id FROM public.quick_plans WHERE quick_plan_list_id IS NULL
    LOOP
        INSERT INTO public.quick_plan_lists (creator_id, name)
        VALUES (user_record.creator_id, 'Quick Plans')
        RETURNING id INTO new_list_id;

        UPDATE public.quick_plans
        SET quick_plan_list_id = new_list_id
        WHERE creator_id = user_record.creator_id AND quick_plan_list_id IS NULL;
    END LOOP;
END $$;

-- 4. Enable RLS on quick_plan_lists
ALTER TABLE public.quick_plan_lists ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies on quick_plan_lists (scoped strictly to creator_id = auth.uid())
CREATE POLICY "Users can select their own quick plan lists"
    ON public.quick_plan_lists FOR SELECT TO authenticated
    USING (auth.uid() = creator_id);

CREATE POLICY "Users can insert their own quick plan lists"
    ON public.quick_plan_lists FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can update their own quick plan lists"
    ON public.quick_plan_lists FOR UPDATE TO authenticated
    USING (auth.uid() = creator_id)
    WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Users can delete their own quick plan lists"
    ON public.quick_plan_lists FOR DELETE TO authenticated
    USING (auth.uid() = creator_id);

-- 6. Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_quick_plan_lists_creator_id ON public.quick_plan_lists(creator_id);
CREATE INDEX IF NOT EXISTS idx_quick_plans_list_id ON public.quick_plans(quick_plan_list_id);
