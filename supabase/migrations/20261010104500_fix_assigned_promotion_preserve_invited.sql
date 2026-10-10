-- Migration: 20261010104500_fix_assigned_promotion_preserve_invited.sql
-- Description:
--   Updates public.auto_promote_waitlist_for_assigned so that when a vacancy opens in GOING:
--   1. The first participant in waitlist order is promoted to assigned_group = 'GOING'.
--   2. If their rsvp_status is WAITLISTED (or REJOINED), they become rsvp_status = 'JOINED'.
--   3. If their rsvp_status is INVITED, their rsvp_status remains 'INVITED' (preserved).
--   4. Their waitlist_position and joined_queue_at are cleared to NULL.
--   5. Remaining waitlist participants are renumbered consecutively (1..N) via collision-free two-stage staging.

CREATE OR REPLACE FUNCTION public.auto_promote_waitlist_for_assigned(
  p_plan_id uuid,
  p_vacated_group assigned_group_enum DEFAULT 'GOING'::assigned_group_enum
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_filtering_mode   participant_filtering_type;
  v_plan_size        INT;
  v_current_going    INT;
  v_available_spots  INT;
  v_promoted_count   INT := 0;
  v_candidate        RECORD;
  v_order_mode       waitlist_order_mode_enum;
BEGIN
  -- 1. Verify plan exists and is ASSIGNED (lock plan record for atomic coordination)
  SELECT participant_filtering, plan_size, COALESCE(waitlist_order_mode, 'AUTO'::waitlist_order_mode_enum)
    INTO v_filtering_mode, v_plan_size, v_order_mode
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING or NULL (spot opened in GOING / capacity increase), promote from waitlist
  IF p_vacated_group = 'GOING'::assigned_group_enum OR p_vacated_group IS NULL THEN
    IF v_plan_size IS NOT NULL AND v_plan_size > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;

      v_available_spots := GREATEST(0, v_plan_size - v_current_going);

      IF v_available_spots > 0 THEN
        -- Loop over waitlist candidates in canonical priority order up to v_available_spots
        FOR v_candidate IN
          SELECT pp.user_id, pp.rsvp_status, pp.assigned_group, pp.waitlist_position
            FROM public.plan_participants pp
            LEFT JOIN public.users u ON u.id = pp.user_id
           WHERE pp.plan_id = p_plan_id
             AND pp.rsvp_status != 'SKIPPED'::rsvp_status
             AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
           ORDER BY
             COALESCE(pp.waitlist_position, 2147483647) ASC,
             CASE pp.rsvp_status
               WHEN 'WAITLISTED'::rsvp_status THEN 1
               WHEN 'REJOINED'::rsvp_status THEN 2
               WHEN 'INVITED'::rsvp_status THEN 3
               ELSE 4
             END ASC,
             pp.joined_queue_at ASC NULLS LAST,
             pp.created_at ASC,
             COALESCE(u.full_name, u.username, '') ASC
           LIMIT v_available_spots
           FOR UPDATE OF pp
        LOOP
          IF v_candidate.rsvp_status = 'INVITED'::rsvp_status THEN
            -- If their RSVP status is INVITED: move to GOING but preserve rsvp_status = INVITED
            UPDATE public.plan_participants
               SET assigned_group    = 'GOING'::assigned_group_enum,
                   waitlist_position = NULL,
                   joined_queue_at   = NULL,
                   updated_at        = now()
             WHERE plan_id = p_plan_id AND user_id = v_candidate.user_id;
          ELSE
            -- If their RSVP status is WAITLISTED / REJOINED: move to GOING and set rsvp_status = JOINED
            UPDATE public.plan_participants
               SET rsvp_status       = 'JOINED'::rsvp_status,
                   assigned_group    = 'GOING'::assigned_group_enum,
                   waitlist_position = NULL,
                   joined_queue_at   = NULL,
                   responded_at      = COALESCE(responded_at, now()),
                   updated_at        = now()
             WHERE plan_id = p_plan_id AND user_id = v_candidate.user_id;
          END IF;

          v_promoted_count := v_promoted_count + 1;
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
  -- Stage 1: Temporary offset 10000 + new_pos (guarantees no unique constraint collision)
  WITH numbered AS (
    SELECT pp.user_id,
           ROW_NUMBER() OVER (
             ORDER BY
               COALESCE(pp.waitlist_position, 2147483647) ASC,
               CASE pp.rsvp_status
                 WHEN 'WAITLISTED'::rsvp_status THEN 1
                 WHEN 'REJOINED'::rsvp_status THEN 2
                 WHEN 'INVITED'::rsvp_status THEN 3
                 ELSE 4
               END ASC,
               pp.joined_queue_at ASC NULLS LAST,
               pp.created_at ASC,
               COALESCE(u.full_name, u.username, '') ASC
           ) AS new_pos
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id 
       AND pp.rsvp_status != 'SKIPPED'::rsvp_status
       AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
  )
  UPDATE public.plan_participants pp
     SET waitlist_position = 10000 + n.new_pos,
         assigned_group    = 'WAITLIST'::assigned_group_enum
    FROM numbered n
   WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

  -- Stage 2: Finalize 1-indexed contiguous positions
  UPDATE public.plan_participants pp
     SET waitlist_position = pp.waitlist_position - 10000,
         updated_at        = now()
   WHERE pp.plan_id = p_plan_id
     AND pp.assigned_group = 'WAITLIST'::assigned_group_enum
     AND pp.waitlist_position > 10000;

  -- Stage 3: Clean up any non-waitlist participants so their waitlist_position is strictly NULL
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (assigned_group IS DISTINCT FROM 'WAITLIST'::assigned_group_enum OR rsvp_status = 'SKIPPED'::rsvp_status)
     AND waitlist_position IS NOT NULL;

  RETURN v_promoted_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_promote_waitlist_for_assigned(uuid, assigned_group_enum) TO service_role;
