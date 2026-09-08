-- Migration: 20260731162500_create_plan_activity.sql
-- Description: Create PostgreSQL enum plan_activity_type and append-only table plan_activity for historical plan activity feed.

-- 1. CREATE ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_activity_type') THEN
    CREATE TYPE public.plan_activity_type AS ENUM (
      'plan_created',
      'participant_invited',
      'participant_joined',
      'participant_left',
      'participant_waitlisted',
      'participant_promoted',
      'participant_removed',
      'invitation_accepted',
      'invitation_declined',
      'capacity_changed',
      'title_changed',
      'description_changed',
      'date_changed',
      'time_changed',
      'location_changed',
      'host_transferred',
      'plan_cancelled',
      'plan_restored',
      'plan_completed'
    );
  END IF;
END $$;

-- 2. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.plan_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  target_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  activity_type public.plan_activity_type NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_plan_activity_plan_id ON public.plan_activity(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_activity_created_at ON public.plan_activity(created_at);
CREATE INDEX IF NOT EXISTS idx_plan_activity_activity_type ON public.plan_activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_plan_activity_plan_created_at_desc ON public.plan_activity(plan_id, created_at DESC);

-- 4. DOCUMENTATION COMMENTS
COMMENT ON TABLE public.plan_activity IS 'Append-only historical audit log and activity timeline for plans.';
COMMENT ON COLUMN public.plan_activity.id IS 'Primary key UUID.';
COMMENT ON COLUMN public.plan_activity.plan_id IS 'The plan this activity belongs to (references public.plans.id).';
COMMENT ON COLUMN public.plan_activity.actor_id IS 'The user who performed the activity (references public.users.id).';
COMMENT ON COLUMN public.plan_activity.target_user_id IS 'Optional target user affected by the activity (references public.users.id).';
COMMENT ON COLUMN public.plan_activity.activity_type IS 'Enum type of activity event.';
COMMENT ON COLUMN public.plan_activity.metadata IS 'JSONB payload for event-specific details (old/new title, capacity changes, etc.).';
COMMENT ON COLUMN public.plan_activity.created_at IS 'Timestamp when the activity occurred.';
COMMENT ON COLUMN public.plan_activity.updated_at IS 'Timestamp when the activity record was created/updated.';

-- 5. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.plan_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow plan participants to select plan_activity" ON public.plan_activity;
DROP POLICY IF EXISTS "Deny insert on plan_activity for authenticated users" ON public.plan_activity;
DROP POLICY IF EXISTS "Deny update on plan_activity for authenticated users" ON public.plan_activity;
DROP POLICY IF EXISTS "Deny delete on plan_activity for authenticated users" ON public.plan_activity;

-- SELECT Policy: Users can only read activity if they are a participant of the corresponding plan
CREATE POLICY "Allow plan participants to select plan_activity"
ON public.plan_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_participants.plan_id = plan_activity.plan_id
      AND plan_participants.user_id = auth.uid()
  )
);

-- INSERT Policy: Deny direct user inserts (inserts happen via trusted RPCs or server-side functions)
CREATE POLICY "Deny insert on plan_activity for authenticated users"
ON public.plan_activity
FOR INSERT
TO authenticated
WITH CHECK (false);

-- UPDATE Policy: Deny all updates (table is strictly append-only)
CREATE POLICY "Deny update on plan_activity for authenticated users"
ON public.plan_activity
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

-- DELETE Policy: Deny all deletes
CREATE POLICY "Deny delete on plan_activity for authenticated users"
ON public.plan_activity
FOR DELETE
TO authenticated
USING (false);
