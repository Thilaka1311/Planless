-- ============================================================
-- Migration: Allow active hosts to operate on temporary plan images (<planId>-newimage.webp)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_plan_image_host(object_name text, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_raw_id text;
  v_plan_id uuid;
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Extract plan UUID from object name (e.g. "<planId>.webp", "<planId>-newimage.webp")
  v_raw_id := split_part(storage.filename(object_name), '.', 1);
  -- Strip loop suffixes and temporary replacement suffixes
  v_raw_id := regexp_replace(v_raw_id, '(-loop-(prev|next)-dup|-newimage.*)', '', 'g');

  IF v_raw_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;

  v_plan_id := v_raw_id::uuid;

  -- Verify caller is an active host of this plan
  RETURN EXISTS (
    SELECT 1 FROM public.plan_participants
     WHERE plan_id = v_plan_id
       AND plan_participants.user_id = is_plan_image_host.user_id
       AND plan_participants.role = 'HOST'::participant_role
       AND plan_participants.rsvp_status = 'JOINED'::rsvp_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_plan_image_host(TEXT, UUID) TO authenticated;
