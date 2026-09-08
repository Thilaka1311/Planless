-- Migration: Unique Constraint for Waitlist Positions per Plan
-- Description: 1. Clears waitlist_position for any GOING participant.
--              2. Resolves duplicate waitlist_position values per plan by re-ranking them.
--              3. Creates a partial UNIQUE index on (plan_id, waitlist_position)
--                 where assigned_group = 'WAITLIST' and waitlist_position IS NOT NULL.

-- Step 1: Ensure waitlist_position is NULL for GOING participants
UPDATE public.plan_participants
   SET waitlist_position = NULL
 WHERE assigned_group = 'GOING'::assigned_group_enum;

-- Step 2: Detect and resolve any duplicate waitlist_position values within each plan
WITH ranked_duplicates AS (
  SELECT
    plan_id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY plan_id
      ORDER BY waitlist_position ASC, join_queue ASC NULLS LAST, created_at ASC
    ) AS new_pos
  FROM public.plan_participants
 WHERE assigned_group = 'WAITLIST'::assigned_group_enum
   AND waitlist_position IS NOT NULL
)
UPDATE public.plan_participants pp
   SET waitlist_position = rd.new_pos
  FROM ranked_duplicates rd
 WHERE pp.plan_id = rd.plan_id
   AND pp.user_id = rd.user_id;

-- Step 3: Create partial UNIQUE index for waitlist_position per plan
DROP INDEX IF EXISTS idx_uniq_plan_waitlist_position;

CREATE UNIQUE INDEX idx_uniq_plan_waitlist_position
ON public.plan_participants (plan_id, waitlist_position)
WHERE assigned_group = 'WAITLIST'::assigned_group_enum
  AND waitlist_position IS NOT NULL;
