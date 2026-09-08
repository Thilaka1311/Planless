-- Migration: Refactor Waitlist Queue Ordering
-- Description: Adds join_queue and waitlist_position to plan_participants,
--              and waitlist_order_mode enum/column to plans.

-- 1. Create waitlist_order_mode_enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'waitlist_order_mode_enum') THEN
    CREATE TYPE public.waitlist_order_mode_enum AS ENUM ('AUTO', 'CUSTOM');
  END IF;
END $$;

-- 2. Add waitlist_order_mode column to plans table
ALTER TABLE public.plans
ADD COLUMN IF NOT EXISTS waitlist_order_mode public.waitlist_order_mode_enum NOT NULL DEFAULT 'AUTO';

-- 3. Add join_queue and waitlist_position columns to plan_participants table
ALTER TABLE public.plan_participants
ADD COLUMN IF NOT EXISTS join_queue INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS waitlist_position INTEGER DEFAULT NULL;

-- 4. Backfill join_queue for all existing plan_participants based on created_at ASC per plan
WITH ranked_participants AS (
  SELECT
    plan_id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY created_at ASC) AS seq
  FROM public.plan_participants
)
UPDATE public.plan_participants pp
SET join_queue = rp.seq
FROM ranked_participants rp
WHERE pp.plan_id = rp.plan_id AND pp.user_id = rp.user_id;

-- 5. Trigger function to auto-assign join_queue on INSERT if NULL
CREATE OR REPLACE FUNCTION public.trg_auto_assign_join_queue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_queue INT;
BEGIN
  IF NEW.join_queue IS NULL THEN
    SELECT COALESCE(MAX(join_queue), 0)
      INTO v_max_queue
      FROM public.plan_participants
     WHERE plan_id = NEW.plan_id;

    NEW.join_queue := v_max_queue + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_join_queue_trigger ON public.plan_participants;
CREATE TRIGGER trg_auto_assign_join_queue_trigger
BEFORE INSERT ON public.plan_participants
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_assign_join_queue();
