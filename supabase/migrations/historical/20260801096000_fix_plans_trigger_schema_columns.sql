-- Migration: 20260801096000_fix_plans_trigger_schema_columns.sql
-- Description: Fix log_plan_lifecycle_activity trigger to use exact plans table column names:
--              1. Replaces OLD.location / NEW.location with OLD.place_name / NEW.place_name.
--              2. Replaces OLD.date / OLD.time with OLD.scheduled_at / NEW.scheduled_at.

CREATE OR REPLACE FUNCTION public.log_plan_lifecycle_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- INSERT (Plan Creation)
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (
      NEW.id,
      NEW.host_id,
      NEW.host_id,
      'plan_created'::plan_activity_type,
      jsonb_build_object('title', NEW.title)
    );
    RETURN NEW;
  END IF;

  -- UPDATE (Plan Property Changes)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.title IS DISTINCT FROM NEW.title THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'title_changed'::plan_activity_type,
        jsonb_build_object('old_title', OLD.title, 'new_title', NEW.title)
      );
    END IF;

    IF OLD.description IS DISTINCT FROM NEW.description THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'description_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.place_name IS DISTINCT FROM NEW.place_name THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'location_changed'::plan_activity_type,
        jsonb_build_object('new_location', NEW.place_name)
      );
    END IF;

    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), NEW.host_id),
        NULL,
        'date_changed'::plan_activity_type,
        jsonb_build_object('old_scheduled_at', OLD.scheduled_at, 'new_scheduled_at', NEW.scheduled_at)
      );
    END IF;

    IF OLD.host_id IS DISTINCT FROM NEW.host_id THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        COALESCE(auth.uid(), OLD.host_id),
        NEW.host_id,
        'host_transferred'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;
