


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."activity_category" AS ENUM (
    'SPORTS',
    'MOVIES',
    'DINING',
    'ENTERTAINMENT',
    'TRAVEL',
    'FITNESS',
    'STUDY',
    'OTHER'
);


ALTER TYPE "public"."activity_category" OWNER TO "postgres";


CREATE TYPE "public"."activity_subcategory" AS ENUM (
    'FOOTBALL',
    'BADMINTON',
    'CRICKET',
    'BASKETBALL',
    'VOLLEYBALL',
    'TENNIS',
    'PICKLEBALL',
    'BOWLING',
    'GO_KARTING',
    'MOVIE',
    'RESTAURANT',
    'CAFE',
    'ROAD_TRIP',
    'GYM',
    'STUDY_SESSION',
    'OTHER'
);


ALTER TYPE "public"."activity_subcategory" OWNER TO "postgres";


CREATE TYPE "public"."assigned_group_enum" AS ENUM (
    'GOING',
    'WAITLIST'
);


ALTER TYPE "public"."assigned_group_enum" OWNER TO "postgres";


CREATE TYPE "public"."attendance_status" AS ENUM (
    'ATTENDED',
    'DID_NOT_ATTEND'
);


ALTER TYPE "public"."attendance_status" OWNER TO "postgres";


CREATE TYPE "public"."circle_role" AS ENUM (
    'creator_admin',
    'admin',
    'member'
);


ALTER TYPE "public"."circle_role" OWNER TO "postgres";


CREATE TYPE "public"."completion_status" AS ENUM (
    'PENDING',
    'SUBMITTED',
    'VERIFIED'
);


ALTER TYPE "public"."completion_status" OWNER TO "postgres";


CREATE TYPE "public"."discovery_category" AS ENUM (
    'SPORTS',
    'MOVIES',
    'DINING',
    'DRINKS',
    'CUSTOM',
    'QUICK_PLAN'
);


ALTER TYPE "public"."discovery_category" OWNER TO "postgres";


CREATE TYPE "public"."discovery_status" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'ARCHIVED'
);


ALTER TYPE "public"."discovery_status" OWNER TO "postgres";


CREATE TYPE "public"."friendship_status" AS ENUM (
    'PENDING',
    'ACCEPTED'
);


ALTER TYPE "public"."friendship_status" OWNER TO "postgres";


CREATE TYPE "public"."message_status" AS ENUM (
    'SENT',
    'DELIVERED'
);


ALTER TYPE "public"."message_status" OWNER TO "postgres";


CREATE TYPE "public"."message_type" AS ENUM (
    'text',
    'system',
    'poll',
    'cost'
);


ALTER TYPE "public"."message_type" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'PLAN_INVITATION',
    'PARTICIPANT_JOINED',
    'PARTICIPANT_SKIPPED',
    'PLAN_CANCELLED',
    'PLAN_REMINDER',
    'FRIEND_REQUEST',
    'FRIEND_REQUEST_ACCEPTED',
    'PAYMENT_RECEIVED',
    'PAYMENT_REMINDER',
    'MEMORY_GENERATED'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."participant_filtering_type" AS ENUM (
    'AUTOMATIC',
    'ASSIGNED'
);


ALTER TYPE "public"."participant_filtering_type" OWNER TO "postgres";


CREATE TYPE "public"."participant_payment_status" AS ENUM (
    'PENDING',
    'SETTLED'
);


ALTER TYPE "public"."participant_payment_status" OWNER TO "postgres";


CREATE TYPE "public"."participant_role" AS ENUM (
    'HOST',
    'PARTICIPANT'
);


ALTER TYPE "public"."participant_role" OWNER TO "postgres";


CREATE TYPE "public"."plan_activity_type" AS ENUM (
    'participant_joined',
    'participant_waitlisted',
    'participant_skipped',
    'participant_moved_to_joined',
    'participant_moved_to_waitlist',
    'participant_removed',
    'participant_left',
    'plan_datetime_changed',
    'plan_created',
    'plan_location_changed',
    'participant_invites_toggled',
    'participants_swapped',
    'plan_changed',
    'host_promoted'
);


ALTER TYPE "public"."plan_activity_type" OWNER TO "postgres";


CREATE TYPE "public"."plan_status" AS ENUM (
    'LIVE',
    'COMPLETED',
    'CANCELLED'
);


ALTER TYPE "public"."plan_status" OWNER TO "postgres";


CREATE TYPE "public"."rsvp_status" AS ENUM (
    'INVITED',
    'JOINED',
    'SKIPPED',
    'WAITLISTED',
    'REJOINED'
);


ALTER TYPE "public"."rsvp_status" OWNER TO "postgres";


CREATE TYPE "public"."skip_reason" AS ENUM (
    'LEFT',
    'REMOVED',
    'REPLACED',
    'PAYMENT_KEPT',
    'SKIPPED'
);


ALTER TYPE "public"."skip_reason" OWNER TO "postgres";


CREATE TYPE "public"."system_message_type" AS ENUM (
    'plan_created',
    'participant_joined',
    'participant_left',
    'title_changed',
    'description_changed',
    'date_changed',
    'time_changed',
    'venue_changed',
    'plan_cancelled',
    'plan_restored',
    'plan_completed'
);


ALTER TYPE "public"."system_message_type" OWNER TO "postgres";


CREATE TYPE "public"."team_type" AS ENUM (
    'TEAM_1',
    'TEAM_2'
);


ALTER TYPE "public"."team_type" OWNER TO "postgres";


CREATE TYPE "public"."transaction_status" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);


ALTER TYPE "public"."transaction_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'user',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."waitlist_order_mode_enum" AS ENUM (
    'AUTO',
    'CUSTOM'
);


ALTER TYPE "public"."waitlist_order_mode_enum" OWNER TO "postgres";


CREATE TYPE "public"."wallet_expense_status" AS ENUM (
    'PENDING',
    'SETTLED'
);


ALTER TYPE "public"."wallet_expense_status" OWNER TO "postgres";


CREATE TYPE "public"."wallet_expense_type" AS ENUM (
    'PLAN_EXPENSE',
    'ADDITIONAL_EXPENSE'
);


ALTER TYPE "public"."wallet_expense_type" OWNER TO "postgres";


CREATE TYPE "public"."wallet_status" AS ENUM (
    'PENDING',
    'PAID'
);


ALTER TYPE "public"."wallet_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_promote_waitlist_for_assigned"("p_plan_id" "uuid", "p_vacated_group" "public"."assigned_group_enum") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_filtering_mode   participant_filtering_type;
  v_max_participants INT;
  v_current_going    INT;
  v_promoted_user_id UUID;
  v_promoted_count   INT := 0;
BEGIN
  -- 1. Verify plan exists and is ASSIGNED
  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;
     
  IF NOT FOUND OR v_filtering_mode IS DISTINCT FROM 'ASSIGNED'::participant_filtering_type THEN
    RETURN 0;
  END IF;

  -- 2. If vacated group was GOING, attempt promotion of WAITLIST #1
  IF p_vacated_group = 'GOING'::assigned_group_enum THEN
    IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
      SELECT count(*) INTO v_current_going
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'GOING'::assigned_group_enum
         AND rsvp_status != 'SKIPPED'::rsvp_status;
         
      IF v_current_going < v_max_participants THEN
        -- Find WAITLIST #1 strictly by waitlist_position
        SELECT user_id INTO v_promoted_user_id
          FROM public.plan_participants
         WHERE plan_id = p_plan_id
           AND assigned_group = 'WAITLIST'::assigned_group_enum
           AND rsvp_status = 'WAITLISTED'::rsvp_status
         ORDER BY waitlist_position ASC NULLS LAST, created_at ASC
         LIMIT 1
         FOR UPDATE;

        IF v_promoted_user_id IS NOT NULL THEN
          -- Atomically promote WAITLIST #1 to GOING and JOINED
          UPDATE public.plan_participants
             SET rsvp_status       = 'JOINED'::rsvp_status,
                 assigned_group    = 'GOING'::assigned_group_enum,
                 waitlist_position = NULL,
                 updated_at        = now()
           WHERE plan_id = p_plan_id AND user_id = v_promoted_user_id;
           
          v_promoted_count := 1;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 3. Renumber remaining WAITLIST participants contiguously (1..N) without gaps
  WITH numbered AS (
    SELECT user_id, row_number() OVER (ORDER BY waitlist_position ASC NULLS LAST, created_at ASC) as new_pos
      FROM public.plan_participants
     WHERE plan_id = p_plan_id 
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'WAITLISTED'::rsvp_status
  )
  UPDATE public.plan_participants pp
     SET waitlist_position = n.new_pos,
         updated_at        = CASE WHEN pp.waitlist_position IS DISTINCT FROM n.new_pos THEN now() ELSE pp.updated_at END
    FROM numbered n
   WHERE pp.plan_id = p_plan_id AND pp.user_id = n.user_id;

  RETURN v_promoted_count;
END;
$$;


ALTER FUNCTION "public"."auto_promote_waitlist_for_assigned"("p_plan_id" "uuid", "p_vacated_group" "public"."assigned_group_enum") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_promote_waitlist_for_automatic"("p_plan_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_filtering      TEXT;
  v_plan_size      INT;
  v_joined_count   INT;
  v_available      INT;
  v_promoted       INT := 0;
  v_rec            RECORD;
  v_was_system_op  TEXT;
BEGIN
  v_was_system_op := current_setting('app.system_op', true);
  PERFORM set_config('app.system_op', 'true', true);

  -- Check filtering mode and plan_size (join capacity)
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'),
         COALESCE(plan_size, max_participants)
    INTO v_filtering, v_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  -- Do NOT auto-promote on ASSIGNED plans or if plan_size is missing/invalid
  IF NOT FOUND OR v_filtering = 'ASSIGNED' OR v_plan_size IS NULL OR v_plan_size <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Count current Going participants
  SELECT count(*)
    INTO v_joined_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

  v_available := v_plan_size - v_joined_count;

  IF v_available <= 0 THEN
    IF v_was_system_op IS DISTINCT FROM 'true' THEN
      PERFORM set_config('app.system_op', 'false', true);
    END IF;
    RETURN 0;
  END IF;

  -- Promote waitlisted participants in FCFS queue order (joined_queue_at ASC, alphabetical name fallback)
  FOR v_rec IN
    SELECT pp.user_id, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id AND pp.rsvp_status = 'WAITLISTED'::rsvp_status
     ORDER BY pp.joined_queue_at ASC NULLS LAST,
              COALESCE(u.full_name, u.username, '') ASC
     LIMIT v_available
  LOOP
    UPDATE public.plan_participants
       SET rsvp_status       = 'JOINED'::rsvp_status,
           skip_reason       = CASE WHEN skip_reason = 'PAYMENT_KEPT'::skip_reason THEN 'PAYMENT_KEPT'::skip_reason ELSE NULL END,
           waitlist_position = NULL,
           assigned_group    = NULL,
           responded_at      = now(),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = v_rec.user_id;

    v_promoted := v_promoted + 1;
  END LOOP;
  
  -- Recalculate remaining waitlist positions if any promotions occurred
  IF v_promoted > 0 THEN
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  IF v_was_system_op IS DISTINCT FROM 'true' THEN
    PERFORM set_config('app.system_op', 'false', true);
  END IF;

  RETURN v_promoted;
END;
$$;


ALTER FUNCTION "public"."auto_promote_waitlist_for_automatic"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_paid_plan_leave_request"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id            UUID;
  v_leave_requested    BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT leave_requested
    INTO v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_leave_requested IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_cancelled', true
    );
  END IF;

  UPDATE public.plan_participants
     SET leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', false
  );
END;
$$;


ALTER FUNCTION "public"."cancel_paid_plan_leave_request"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_plan"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts may cancel the plan' USING ERRCODE = '40300';
  END IF;

  UPDATE public.plans
     SET status     = 'CANCELLED'::plan_status,
         updated_at = now()
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status',  'CANCELLED'
  );
END;
$$;


ALTER FUNCTION "public"."cancel_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_circle_host_invariant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE host_count INTEGER; current_circle_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN current_circle_id := OLD.circle_id; ELSE current_circle_id := NEW.circle_id; END IF;
    SELECT COUNT(*) INTO host_count FROM circle_members WHERE circle_id = current_circle_id AND role = 'creator_admin';
    IF host_count <> 1 THEN RAISE EXCEPTION 'Constraint Violation: Circle % must have exactly one Creator Admin. Found %.', current_circle_id, host_count; END IF;
    RETURN NULL;
END; $$;


ALTER FUNCTION "public"."check_circle_host_invariant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN public.complete_plan(p_plan_id, p_attendance_input, 'NONE'::text);
END;
$$;


ALTER FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb", "p_expense_mode" "text" DEFAULT 'NONE'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_rsvp_deadline TIMESTAMPTZ;
  v_participant RECORD;
  v_input_attendance attendance_status;
  v_final_attendance attendance_status;
  v_final_state rsvp_status;
  v_final_count INT;
  v_plan_expense RECORD;
  v_share NUMERIC;
  v_final_total_cost NUMERIC;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, scheduled_at, rsvp_deadline, total_cost
  INTO v_plan_status, v_scheduled_at, v_rsvp_deadline, v_final_total_cost
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE; 

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status = 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_ALREADY_COMPLETED' USING ERRCODE = '40000';
  END IF;

  IF jsonb_typeof(p_attendance_input) != 'array' THEN
    RAISE EXCEPTION 'INVALID_ATTENDANCE_FORMAT' USING ERRCODE = '40000';
  END IF;

  -- 3. Auto-insert newly added attendees
  INSERT INTO public.plan_participants (
    plan_id, user_id, rsvp_status, final_attendance, final_state, created_at, updated_at
  )
  SELECT
    p_plan_id,
    (item->>'user_id')::UUID,
    'JOINED'::rsvp_status,
    'ATTENDED'::attendance_status,
    'JOINED'::rsvp_status,
    now(),
    now()
  FROM jsonb_array_elements(p_attendance_input) AS arr(item)
  WHERE (item->>'attendance') = 'ATTENDED'
    AND (item->>'user_id')::UUID NOT IN (
      SELECT user_id FROM public.plan_participants WHERE plan_id = p_plan_id
    )
  ON CONFLICT (plan_id, user_id) DO NOTHING;

  -- 4. Finalize attendance for all participants
  FOR v_participant IN
    SELECT user_id, role, rsvp_status, skip_reason
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
    FOR UPDATE
  LOOP
    v_input_attendance := NULL;

    SELECT (item->>'attendance')::attendance_status
    INTO v_input_attendance
    FROM jsonb_array_elements(p_attendance_input) AS arr(item)
    WHERE (item->>'user_id')::UUID = v_participant.user_id;

    IF v_participant.user_id = v_caller_id THEN
      -- The completing host is present and verified as attended
      v_final_attendance := 'ATTENDED'::attendance_status;
      v_final_state := 'JOINED'::rsvp_status;

    ELSIF v_input_attendance IS NOT NULL THEN
      v_final_attendance := v_input_attendance;
      IF v_input_attendance = 'ATTENDED'::attendance_status THEN
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;

    ELSE
      -- Fallback for participants not explicitly present in payload
      IF v_participant.rsvp_status = 'JOINED'::rsvp_status THEN
        v_final_attendance := 'ATTENDED'::attendance_status;
        v_final_state := 'JOINED'::rsvp_status;
      ELSE
        v_final_attendance := 'DID_NOT_ATTEND'::attendance_status;
        v_final_state := 'SKIPPED'::rsvp_status;
      END IF;
    END IF;

    UPDATE public.plan_participants
    SET rsvp_status = v_final_state,
        final_attendance = v_final_attendance,
        final_state = v_final_state,
        skip_reason = CASE 
          WHEN v_final_attendance = 'ATTENDED'::attendance_status THEN NULL
          WHEN v_participant.rsvp_status IN ('JOINED'::rsvp_status, 'INVITED'::rsvp_status, 'WAITLISTED'::rsvp_status) THEN NULL
          ELSE skip_reason
        END,
        updated_at = now()
    WHERE plan_id = p_plan_id AND user_id = v_participant.user_id;
  END LOOP;

  -- 5. Calculate Final Attended Count
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  -- 6. Handle Plan Expense Recalculation
  IF p_expense_mode IN ('SPLIT_ALL', 'KEEP_CURRENT_COST') AND v_final_count > 0 THEN
    SELECT * INTO v_plan_expense
    FROM public.wallet_expenses
    WHERE plan_id = p_plan_id
      AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_plan_expense.id IS NOT NULL THEN
      
      IF p_expense_mode = 'SPLIT_ALL' THEN
        v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        v_final_total_cost := v_plan_expense.total_amount;
      ELSIF p_expense_mode = 'KEEP_CURRENT_COST' THEN
        SELECT amount_owed INTO v_share
        FROM public.wallet_expense_participants
        WHERE expense_id = v_plan_expense.id AND amount_owed > 0
        ORDER BY amount_owed DESC
        LIMIT 1;

        IF v_share IS NULL OR v_share <= 0 THEN
          v_share := ROUND((v_plan_expense.total_amount / v_final_count)::numeric, 2);
        END IF;

        v_final_total_cost := v_share * v_final_count;

        UPDATE public.wallet_expenses
        SET total_amount = v_final_total_cost,
            updated_at = NOW()
        WHERE id = v_plan_expense.id;
      END IF;
      
      IF v_share IS NULL THEN
        v_share := 0;
      END IF;

      -- Reconcile participant obligations
      FOR v_participant IN
        SELECT user_id, final_attendance
        FROM public.plan_participants
        WHERE plan_id = p_plan_id
      LOOP
        IF v_participant.final_attendance = 'ATTENDED'::attendance_status THEN
          INSERT INTO public.wallet_expense_participants (
            expense_id, user_id, amount_owed, amount_paid, status, created_at, updated_at
          )
          VALUES (
            v_plan_expense.id, v_participant.user_id, v_share, 0, 'PENDING', now(), now()
          )
          ON CONFLICT (expense_id, user_id) DO UPDATE
          SET amount_owed = EXCLUDED.amount_owed,
              status = CASE 
                 WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                 WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                 ELSE EXCLUDED.status 
               END,
              updated_at = now();
        ELSE
          DELETE FROM public.wallet_expense_participants
          WHERE expense_id = v_plan_expense.id 
            AND user_id = v_participant.user_id
            AND status != 'SETTLED';
        END IF;
      END LOOP;

    END IF;
  END IF;

  -- 7. Update Plan Status & attended_participants & total_cost
  IF now() < v_scheduled_at THEN
    v_scheduled_at := now();
    IF v_rsvp_deadline > v_scheduled_at THEN
      v_rsvp_deadline := v_scheduled_at;
    END IF;
  END IF;

  UPDATE public.plans
  SET status = 'COMPLETED'::plan_status,
      attended_participants = v_final_count,
      total_cost = v_final_total_cost,
      scheduled_at = v_scheduled_at,
      rsvp_deadline = v_rsvp_deadline,
      updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'status', 'COMPLETED',
    'attended_participants', v_final_count,
    'final_count', v_final_count,
    'total_cost', v_final_total_cost,
    'scheduled_at', v_scheduled_at,
    'rsvp_deadline', v_rsvp_deadline
  );

END;
$$;


ALTER FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb", "p_expense_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_wallet_settlement"("p_other_user_id" "uuid", "p_amount" numeric, "p_plan_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_caller_id UUID;
    v_payer_id UUID;
    v_receiver_id UUID;
    v_gross_caller_owes NUMERIC := 0;
    v_gross_other_owes NUMERIC := 0;
    v_max_settleable NUMERIC := 0;
    v_offset NUMERIC := 0;
    v_new_settlement public.wallet_settlements%ROWTYPE;
    
    v_remaining_offset NUMERIC := 0;
    v_remaining_primary NUMERIC := 0;
    v_allocation_amount NUMERIC := 0;
    v_expense_row RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to create a settlement.';
    END IF;

    IF v_caller_id = p_other_user_id THEN
        RAISE EXCEPTION 'Cannot create a settlement with yourself.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Settlement amount must be greater than zero.';
    END IF;

    -- 1. Calculate gross expenses caller owes other
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_caller_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = p_other_user_id
      AND pt.user_id = v_caller_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    -- 2. Calculate gross expenses other owes caller
    SELECT COALESCE(SUM(pt.amount_owed - pt.amount_paid), 0)
    INTO v_gross_other_owes
    FROM public.wallet_expense_participants pt
    JOIN public.wallet_expenses e ON e.id = pt.expense_id
    WHERE e.payer_id = v_caller_id
      AND pt.user_id = p_other_user_id
      AND pt.amount_owed > pt.amount_paid
      AND (p_plan_id IS NULL OR e.plan_id = p_plan_id);

    -- 3. Determine Net Direction and Mutual Offset
    IF v_gross_caller_owes > v_gross_other_owes THEN
        -- Caller is net debtor, Other is net creditor
        v_payer_id := v_caller_id;
        v_receiver_id := p_other_user_id;
        v_max_settleable := v_gross_caller_owes - v_gross_other_owes;
        v_offset := v_gross_other_owes;
    ELSIF v_gross_other_owes > v_gross_caller_owes THEN
        -- Other is net debtor, Caller is net creditor
        v_payer_id := p_other_user_id;
        v_receiver_id := v_caller_id;
        v_max_settleable := v_gross_other_owes - v_gross_caller_owes;
        v_offset := v_gross_caller_owes;
    ELSE
        RAISE EXCEPTION 'No outstanding balance owed between users to settle.';
    END IF;

    IF (p_amount - v_max_settleable) > 0.01 THEN
        RAISE EXCEPTION 'Settlement amount (₹%) exceeds current outstanding balance (₹%).', p_amount, v_max_settleable;
    END IF;

    -- 4. Insert settlement record
    INSERT INTO public.wallet_settlements (
        payer_id,
        receiver_id,
        amount,
        plan_id,
        created_at,
        updated_at
    )
    VALUES (
        v_payer_id,
        v_receiver_id,
        p_amount,
        p_plan_id,
        now(),
        now()
    )
    RETURNING * INTO v_new_settlement;

    -- 5. Perform Opposing Netting Allocations (offsetting debts where v_payer_id was creditor and v_receiver_id was debtor)
    IF v_offset > 0 THEN
        v_remaining_offset := v_offset;

        FOR v_expense_row IN
            SELECT pt.id, pt.amount_owed, pt.amount_paid
            FROM public.wallet_expense_participants pt
            JOIN public.wallet_expenses e ON e.id = pt.expense_id
            WHERE e.payer_id = v_payer_id
              AND pt.user_id = v_receiver_id
              AND pt.amount_owed > pt.amount_paid
              AND (p_plan_id IS NULL OR e.plan_id = p_plan_id)
            ORDER BY e.created_at ASC, e.id ASC
            FOR UPDATE OF pt
        LOOP
            IF v_remaining_offset <= 0 THEN
                EXIT;
            END IF;

            v_allocation_amount := LEAST(v_remaining_offset, v_expense_row.amount_owed - v_expense_row.amount_paid);

            IF v_allocation_amount > 0 THEN
                INSERT INTO public.wallet_settlement_allocations (
                    settlement_id,
                    expense_participant_id,
                    amount
                ) VALUES (
                    v_new_settlement.id,
                    v_expense_row.id,
                    v_allocation_amount
                );

                UPDATE public.wallet_expense_participants
                SET amount_paid = amount_paid + v_allocation_amount,
                    status = CASE 
                                WHEN amount_paid + v_allocation_amount >= amount_owed THEN 'SETTLED'::participant_payment_status
                                ELSE 'PENDING'::participant_payment_status
                             END,
                    updated_at = now()
                WHERE id = v_expense_row.id;

                v_remaining_offset := v_remaining_offset - v_allocation_amount;
            END IF;
        END LOOP;
    END IF;

    -- 6. Perform Primary Allocations (where v_payer_id is debtor and v_receiver_id is creditor)
    v_remaining_primary := p_amount + (v_offset - COALESCE(v_remaining_offset, 0));

    FOR v_expense_row IN
        SELECT pt.id, pt.amount_owed, pt.amount_paid
        FROM public.wallet_expense_participants pt
        JOIN public.wallet_expenses e ON e.id = pt.expense_id
        WHERE e.payer_id = v_receiver_id
          AND pt.user_id = v_payer_id
          AND pt.amount_owed > pt.amount_paid
          AND (p_plan_id IS NULL OR e.plan_id = p_plan_id)
        ORDER BY e.created_at ASC, e.id ASC
        FOR UPDATE OF pt
    LOOP
        IF v_remaining_primary <= 0 THEN
            EXIT;
        END IF;

        v_allocation_amount := LEAST(v_remaining_primary, v_expense_row.amount_owed - v_expense_row.amount_paid);

        IF v_allocation_amount > 0 THEN
            INSERT INTO public.wallet_settlement_allocations (
                settlement_id,
                expense_participant_id,
                amount
            ) VALUES (
                v_new_settlement.id,
                v_expense_row.id,
                v_allocation_amount
            );

            UPDATE public.wallet_expense_participants
            SET amount_paid = amount_paid + v_allocation_amount,
                status = CASE 
                            WHEN amount_paid + v_allocation_amount >= amount_owed THEN 'SETTLED'::participant_payment_status
                            ELSE 'PENDING'::participant_payment_status
                         END,
                updated_at = now()
            WHERE id = v_expense_row.id;

            v_remaining_primary := v_remaining_primary - v_allocation_amount;
        END IF;
    END LOOP;

    RETURN to_jsonb(v_new_settlement);
END;
$$;


ALTER FUNCTION "public"."create_wallet_settlement"("p_other_user_id" "uuid", "p_amount" numeric, "p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_wallet_expense"("p_expense_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_payer_id      UUID;
  v_plan_id       UUID;
  v_message_id    UUID;
  v_title         TEXT;
BEGIN
  -- Identify caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Fetch expense details
  SELECT plan_id, message_id, payer_id, title
    INTO v_plan_id, v_message_id, v_payer_id, v_title
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Protect default Plan Fee expenses
  IF v_message_id IS NULL AND v_title = 'Plan Fee' THEN
    RAISE EXCEPTION 'Cannot delete default plan fee expense' USING ERRCODE = '40300';
  END IF;

  -- Strict authorization: Caller MUST be the expense payer/creator
  IF v_caller_id != v_payer_id THEN
    RAISE EXCEPTION 'Not authorized to delete this expense' USING ERRCODE = '40300';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Delete associated wallet_expense_participants
  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id;

  -- Delete wallet_expense row
  DELETE FROM public.wallet_expenses
   WHERE id = p_expense_id;

  -- Clean up associated plan_messages row if message_id is present
  IF v_message_id IS NOT NULL THEN
    DELETE FROM public.plan_messages
     WHERE id = v_message_id;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'plan_id', v_plan_id
  );
END;
$$;


ALTER FUNCTION "public"."delete_wallet_expense"("p_expense_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_wallet_settlement"("p_settlement_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_caller_id UUID;
    v_target_settlement public.wallet_settlements%ROWTYPE;
    v_alloc RECORD;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated to delete a settlement.';
    END IF;

    SELECT * INTO v_target_settlement
    FROM public.wallet_settlements
    WHERE id = p_settlement_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement record not found.';
    END IF;

    IF v_target_settlement.payer_id <> v_caller_id AND v_target_settlement.receiver_id <> v_caller_id THEN
        RAISE EXCEPTION 'Not authorized to delete this settlement.';
    END IF;

    -- Check if it's a historical settlement without allocations
    IF NOT EXISTS (SELECT 1 FROM public.wallet_settlement_allocations WHERE settlement_id = p_settlement_id) THEN
        RAISE EXCEPTION 'This historical settlement cannot be reversed because it has no expense allocation records.';
    END IF;

    -- Reverse allocations
    FOR v_alloc IN
        SELECT expense_participant_id, amount
        FROM public.wallet_settlement_allocations
        WHERE settlement_id = p_settlement_id
    LOOP
        -- Lock and update the participant
        UPDATE public.wallet_expense_participants
        SET amount_paid = amount_paid - v_alloc.amount,
            status = CASE 
                        WHEN amount_paid - v_alloc.amount < amount_owed THEN 'PENDING'::participant_payment_status
                        ELSE 'SETTLED'::participant_payment_status
                     END,
            updated_at = now()
        WHERE id = v_alloc.expense_participant_id;
    END LOOP;

    -- Delete the settlement (allocations cascade)
    DELETE FROM public.wallet_settlements
    WHERE id = p_settlement_id;

    RETURN jsonb_build_object('success', true, 'id', p_settlement_id);
END;
$$;


ALTER FUNCTION "public"."delete_wallet_settlement"("p_settlement_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."demote_from_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_remaining_hosts INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may demote hosts' USING ERRCODE = '40300';
  END IF;

  SELECT role
    INTO v_target_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_role <> 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Target user is not currently a host' USING ERRCODE = '40900';
  END IF;

  -- Last-host protection: Must leave at least one active HOST
  SELECT COUNT(*)
    INTO v_remaining_hosts
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND role = 'HOST'::participant_role
     AND rsvp_status = 'JOINED'::rsvp_status
     AND user_id <> p_target_user_id;

  IF v_remaining_hosts < 1 THEN
    RAISE EXCEPTION 'Cannot demote the last remaining active host' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'demoted_user_id',  p_target_user_id
  );
END;
$$;


ALTER FUNCTION "public"."demote_from_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_plan_participants_completion_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- If plan status transitions to anything other than COMPLETED (e.g. LIVE or CANCELLED)
  IF NEW.status IS DISTINCT FROM 'COMPLETED'::plan_status THEN
    UPDATE public.plan_participants
    SET final_attendance = NULL,
        final_state = NULL
    WHERE plan_id = NEW.id
      AND (final_attendance IS NOT NULL OR final_state IS NOT NULL);
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_plan_participants_completion_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_circle_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE max_id INT; next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id LIKE 'c_%' OR NEW.public_id LIKE '__temp__%' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^C([0-9]+)$')::INT), 0) INTO max_id FROM circles WHERE public_id ~ '^C[0-9]{6}$';
    next_id := max_id + 1;
    NEW.public_id := 'C' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END; $_$;


ALTER FUNCTION "public"."generate_circle_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_discovery_public_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE next_val BIGINT;
BEGIN
  next_val := nextval('discovery_public_id_seq');
  RETURN 'DISC' || lpad(next_val::text, 6, '0');
END; $$;


ALTER FUNCTION "public"."generate_discovery_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_plan_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE max_id INT; next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' OR NEW.public_id LIKE 'P_%' OR NEW.public_id LIKE '__temp__%' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^P([0-9]+)$')::INT), 0) INTO max_id FROM plans WHERE public_id ~ '^P[0-9]{6}$';
    next_id := max_id + 1;
    NEW.public_id := 'P' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END; $_$;


ALTER FUNCTION "public"."generate_plan_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_user_public_id"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE next_val BIGINT;
BEGIN
  next_val := nextval('user_public_id_seq');
  RETURN 'U' || lpad(next_val::text, 6, '0');
END; $$;


ALTER FUNCTION "public"."generate_user_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_wallet_expense_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE max_id INT; next_id INT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    SELECT COALESCE(MAX(SUBSTRING(public_id FROM '^W([0-9]+)$')::INT), 0) INTO max_id FROM wallet_expenses WHERE public_id ~ '^W[0-9]{6}$';
    next_id := max_id + 1;
    NEW.public_id := 'W' || LPAD(next_id::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END; $_$;


ALTER FUNCTION "public"."generate_wallet_expense_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_wallet_transaction_public_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE next_val BIGINT;
BEGIN
  IF NEW.public_id IS NULL OR NEW.public_id = '' THEN
    next_val := nextval('public.wallet_transaction_public_id_seq');
    NEW.public_id := 'TXN' || lpad(next_val::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_wallet_transaction_public_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_plan_participant_filtering"("p_plan_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
  FROM public.plans
  WHERE id = p_plan_id;
$$;


ALTER FUNCTION "public"."get_plan_participant_filtering"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_plan_creator_participant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  v_creator_id := auth.uid();
  
  IF v_creator_id IS NOT NULL THEN
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      v_creator_id,
      'HOST'::participant_role,
      'JOINED'::rsvp_status,
      CASE WHEN NEW.participant_filtering = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      now(),
      now(),
      now()
    )
    ON CONFLICT (plan_id, user_id) DO UPDATE
    SET role = 'HOST'::participant_role,
        rsvp_status = 'JOINED'::rsvp_status;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_plan_creator_participant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_cost_expense"("p_plan_id" "uuid", "p_message_id" "uuid" DEFAULT NULL::"uuid", "p_payer_id" "uuid" DEFAULT NULL::"uuid", "p_title" "text" DEFAULT 'Shared Expense'::"text", "p_total_amount" numeric DEFAULT 0, "p_participant_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_expense_id UUID;
  v_share      NUMERIC;
  v_count      INTEGER;
  v_uid        UUID;
BEGIN
  -- 1. Determine participant count and share
  v_count := COALESCE(array_length(p_participant_ids, 1), 1);
  IF v_count = 0 THEN v_count := 1; END IF;
  v_share := ROUND((p_total_amount / v_count)::NUMERIC, 2);

  -- 2. Insert wallet_expense row as ADDITIONAL_EXPENSE
  INSERT INTO wallet_expenses (plan_id, message_id, payer_id, title, total_amount, status, expense_type)
  VALUES (p_plan_id, p_message_id, p_payer_id, p_title, p_total_amount, 'PENDING', 'ADDITIONAL_EXPENSE')
  RETURNING id INTO v_expense_id;

  -- 3. Insert participant rows
  FOREACH v_uid IN ARRAY p_participant_ids
  LOOP
    INSERT INTO wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
    VALUES (v_expense_id, v_uid, v_share, 0, 'PENDING')
    ON CONFLICT (expense_id, user_id) DO UPDATE
      SET amount_owed = EXCLUDED.amount_owed,
          updated_at = NOW();
  END LOOP;

  RETURN v_expense_id;
END;
$$;


ALTER FUNCTION "public"."insert_cost_expense"("p_plan_id" "uuid", "p_message_id" "uuid", "p_payer_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_participant_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_participants"("p_plan_id" "uuid", "p_invitee_user_ids" "uuid"[], "p_assigned_group" "public"."assigned_group_enum" DEFAULT NULL::"public"."assigned_group_enum") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID;
  v_caller_role participant_role;
  v_allow_participant_invites BOOLEAN;
  v_filtering participant_filtering_type;
  v_invitee_id UUID;
  v_existing_status rsvp_status;
  v_invited_count INT := 0;
  v_reactivated_count INT := 0;
  v_target_assigned_group assigned_group_enum;
  v_total_invited INT := 0;
  v_final_max_participants INT;
  v_final_plan_size INT;
BEGIN
  -- 1. Identify authenticated user from JWT context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Fetch caller's role in the plan
  SELECT role
    INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  -- 3. Fetch plan settings & filtering mode
  SELECT allow_participant_invites, participant_filtering
    INTO v_allow_participant_invites, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Authorization Check
  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not associated with this plan' USING ERRCODE = '40300';
  END IF;

  IF v_caller_role = 'HOST'::participant_role THEN
    NULL;
  ELSIF v_caller_role = 'PARTICIPANT'::participant_role AND COALESCE(v_allow_participant_invites, false) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Unauthorized: Participant invites are disabled for this plan' USING ERRCODE = '40301';
  END IF;

  -- Determine effective assigned_group (NULL if AUTOMATIC)
  IF v_filtering = 'AUTOMATIC'::participant_filtering_type THEN
    v_target_assigned_group := NULL;
  ELSE
    v_target_assigned_group := COALESCE(p_assigned_group, 'GOING'::assigned_group_enum);
  END IF;

  -- 5. Process invitees in a single atomic loop
  IF p_invitee_user_ids IS NOT NULL THEN
    FOREACH v_invitee_id IN ARRAY p_invitee_user_ids
    LOOP
      IF v_invitee_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Check if participant record already exists
      SELECT rsvp_status
        INTO v_existing_status
        FROM public.plan_participants
       WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

      IF FOUND THEN
        -- Reactivate or update existing participant
        UPDATE public.plan_participants
           SET rsvp_status = 'INVITED'::rsvp_status,
               assigned_group = v_target_assigned_group,
               responded_at = NULL,
               skip_reason = NULL,
               updated_at = now()
         WHERE plan_id = p_plan_id AND user_id = v_invitee_id;

        v_reactivated_count := v_reactivated_count + 1;
      ELSE
        -- Insert fresh participant
        INSERT INTO public.plan_participants (
          plan_id,
          user_id,
          role,
          rsvp_status,
          assigned_group,
          responded_at,
          skip_reason
        ) VALUES (
          p_plan_id,
          v_invitee_id,
          'PARTICIPANT'::participant_role,
          'INVITED'::rsvp_status,
          v_target_assigned_group,
          NULL,
          NULL
        );

        v_invited_count := v_invited_count + 1;
      END IF;
    END LOOP;
  END IF;

  -- 6. Invariant: plans.max_participants must always be at least the total invited participant count
  SELECT COUNT(*)
    INTO v_total_invited
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND rsvp_status != 'SKIPPED'::rsvp_status;

  UPDATE public.plans
     SET max_participants = GREATEST(COALESCE(max_participants, 0), v_total_invited),
         updated_at = now()
   WHERE id = p_plan_id
     AND (max_participants IS NULL OR max_participants < v_total_invited);

  SELECT max_participants, plan_size
    INTO v_final_max_participants, v_final_plan_size
    FROM public.plans
   WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success',              true,
    'plan_id',              p_plan_id,
    'invited_count',        v_invited_count,
    'reactivated_count',    v_reactivated_count,
    'total_invited_count',  v_total_invited,
    'max_participants',     v_final_max_participants,
    'plan_size',            v_final_plan_size
  );
END;
$$;


ALTER FUNCTION "public"."invite_participants"("p_plan_id" "uuid", "p_invitee_user_ids" "uuid"[], "p_assigned_group" "public"."assigned_group_enum") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM wallet_expense_participants
    WHERE expense_id = p_expense_id AND user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_plan_host"("p_plan_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.plan_participants
    WHERE plan_id = p_plan_id
      AND user_id = p_user_id
      AND role = 'HOST'::participant_role
      AND rsvp_status = 'JOINED'::rsvp_status
  );
$$;


ALTER FUNCTION "public"."is_plan_host"("p_plan_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_plan_image_host"("object_name" "text", "user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_raw_id text;
  v_plan_id uuid;
  v_folders text[];
BEGIN
  IF user_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Try extracting plan UUID from folder name first: "<planId>/plancoverimageN.webp"
  v_folders := storage.foldername(object_name);
  IF array_length(v_folders, 1) >= 1 AND v_folders[1] IS NOT NULL AND v_folders[1] <> '' THEN
    v_raw_id := v_folders[1];
  ELSE
    -- 2. Fallback for legacy flat filenames: "<planId>.webp" or "<planId>-newimage.webp"
    v_raw_id := split_part(storage.filename(object_name), '.', 1);
  END IF;

  -- Strip any carousel loop duplicate suffixes if present
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
$_$;


ALTER FUNCTION "public"."is_plan_image_host"("object_name" "text", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_wallet_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_expense_participants
    WHERE expense_id = p_expense_id
      AND user_id = p_user_id
  );
$$;


ALTER FUNCTION "public"."is_wallet_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_plan"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id                  UUID;
  v_max_participants         INT;
  v_total_cost               NUMERIC;
  v_current_role             participant_role;
  v_current_rsvp             rsvp_status;
  v_vacated_group            assigned_group_enum;
  v_promoted_count           INT := 0;
  v_active_count             INT := 0;
  v_new_cost_per_participant NUMERIC;
  v_filtering_mode           participant_filtering_type;
  v_remaining_hosts          INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT max_participants, total_cost, participant_filtering
    INTO v_max_participants, v_total_cost, v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role, rsvp_status, assigned_group
    INTO v_current_role, v_current_rsvp, v_vacated_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_rsvp = 'SKIPPED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', v_user_id,
      'already_left', true
    );
  END IF;

  -- Last-host protection: Host cannot leave if they are the sole active host
  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot leave the plan as the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  UPDATE public.plan_participants
     SET role              = 'PARTICIPANT'::participant_role,
         rsvp_status       = 'SKIPPED'::rsvp_status,
         skip_reason       = 'LEFT'::skip_reason,
         assigned_group    = NULL,
         waitlist_position = NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_vacated_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_vacated_group);
      END IF;
    END IF;
  END IF;

  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';

    IF v_active_count > 0 THEN
      v_new_cost_per_participant := round(v_total_cost / v_active_count, 2);
    ELSE
      v_new_cost_per_participant := NULL;
    END IF;

    UPDATE public.plan_participants
       SET cost_per_participant = v_new_cost_per_participant,
           updated_at           = now()
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED';
  END IF;

  RETURN jsonb_build_object(
    'success',            true,
    'plan_id',            p_plan_id,
    'user_id',            v_user_id,
    'promoted_user_id',   NULL,
    'promoted_count',     v_promoted_count
  );
END;
$$;


ALTER FUNCTION "public"."leave_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_plan_lifecycle_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_actor_id UUID;
BEGIN
  v_actor_id := auth.uid();

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
    VALUES (
      NEW.id,
      v_actor_id,
      v_actor_id,
      'plan_created'::plan_activity_type,
      jsonb_build_object('title', NEW.title)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.title IS DISTINCT FROM NEW.title) THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_changed'::plan_activity_type,
        '{}'::jsonb
      );
    END IF;

    IF OLD.place_name IS DISTINCT FROM NEW.place_name THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_location_changed'::plan_activity_type,
        jsonb_build_object('new_location', NEW.place_name)
      );
    END IF;

    IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at THEN
      INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
      VALUES (
        NEW.id,
        v_actor_id,
        NULL,
        'plan_datetime_changed'::plan_activity_type,
        jsonb_build_object('old_scheduled_at', OLD.scheduled_at, 'new_scheduled_at', NEW.scheduled_at)
      );
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_plan_lifecycle_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_plan_participant_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_effective_actor_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status OR OLD.assigned_group IS DISTINCT FROM NEW.assigned_group) THEN

    IF (auth.uid() IS NOT NULL AND auth.uid() != NEW.user_id) OR current_setting('app.system_op', true) = 'true' THEN
      v_effective_actor_id := COALESCE(
        NULLIF(auth.uid(), NEW.user_id),
        (SELECT user_id FROM public.plan_participants WHERE plan_id = NEW.plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status ORDER BY created_at ASC LIMIT 1),
        NEW.user_id
      );

      IF (NEW.assigned_group = 'GOING' AND OLD.assigned_group IS DISTINCT FROM 'GOING') OR 
         (NEW.rsvp_status = 'JOINED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'JOINED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_joined'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'joined'
          )
        );

      ELSIF (NEW.assigned_group = 'WAITLIST' AND OLD.assigned_group IS DISTINCT FROM 'WAITLIST') OR 
            (NEW.rsvp_status = 'WAITLISTED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'WAITLISTED'::rsvp_status AND NEW.assigned_group IS NOT DISTINCT FROM OLD.assigned_group) THEN
        
        INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
        VALUES (
          NEW.plan_id,
          v_effective_actor_id,
          NEW.user_id,
          'participant_moved_to_waitlist'::plan_activity_type,
          jsonb_build_object(
            'from', LOWER(COALESCE(OLD.assigned_group::text, OLD.rsvp_status::text)),
            'to', 'waitlist'
          )
        );

      ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status AND OLD.rsvp_status IS DISTINCT FROM 'SKIPPED'::rsvp_status THEN
        IF NEW.skip_reason = 'REMOVED'::skip_reason THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            v_effective_actor_id,
            NEW.user_id,
            'participant_removed'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.skip_reason = 'REPLACED'::skip_reason THEN
          NULL;
        END IF;
      END IF;

    ELSE
      IF OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status THEN
        IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_joined'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'WAITLISTED'::rsvp_status THEN
          INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
          VALUES (
            NEW.plan_id,
            NEW.user_id,
            NEW.user_id,
            'participant_waitlisted'::plan_activity_type,
            '{}'::jsonb
          );
        ELSIF NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
          IF NEW.skip_reason = 'REPLACED'::skip_reason THEN
            NULL;
          ELSIF OLD.rsvp_status = 'INVITED'::rsvp_status THEN
            INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
            VALUES (
              NEW.plan_id,
              NEW.user_id,
              NEW.user_id,
              'participant_skipped'::plan_activity_type,
              '{}'::jsonb
            );
          ELSE
            INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata)
            VALUES (
              NEW.plan_id,
              NEW.user_id,
              NEW.user_id,
              'participant_left'::plan_activity_type,
              jsonb_build_object('resolution', NEW.skip_reason)
            );
          END IF;
        END IF;
      END IF;
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_plan_participant_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN public.manage_completed_plan_participants(p_plan_id, p_users_to_add, p_users_to_remove, 'NONE'::text);
END;
$$;


ALTER FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[] DEFAULT '{}'::"uuid"[], "p_users_to_remove" "uuid"[] DEFAULT '{}'::"uuid"[], "p_expense_mode" "text" DEFAULT 'NONE'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id UUID;
  v_plan_status plan_status;
  v_scheduled_at TIMESTAMPTZ;
  v_target_user_id UUID;
  v_initial_attendee_count INT;
  v_final_count INT;
  v_participant RECORD;
  v_plan_expense RECORD;
  v_initial_total_cost NUMERIC;
  v_initial_share NUMERIC;
  v_share NUMERIC;
  v_new_total_cost NUMERIC;
  v_new_max_participants INT;
  v_orig_max_participants INT;
  v_remaining_hosts INT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists and lock row
  SELECT status, total_cost, scheduled_at, max_participants
  INTO v_plan_status, v_initial_total_cost, v_scheduled_at, v_orig_max_participants
  FROM public.plans
  WHERE id = p_plan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active host
  IF NOT EXISTS (
    SELECT 1 FROM public.plan_participants
    WHERE plan_id = p_plan_id AND user_id = v_caller_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
  ) THEN
    RAISE EXCEPTION 'NOT_PLAN_HOST' USING ERRCODE = '40300';
  END IF;

  IF v_plan_status != 'COMPLETED'::plan_status THEN
    RAISE EXCEPTION 'PLAN_NOT_COMPLETED' USING ERRCODE = '40000';
  END IF;

  -- 2b. Enforce 24-hour participant management window from scheduled_at
  IF v_scheduled_at IS NOT NULL AND now() >= (v_scheduled_at + INTERVAL '24 hours') THEN
    RAISE EXCEPTION 'This plan can no longer be managed because the 24-hour participant management window has expired.' USING ERRCODE = '40000';
  END IF;

  -- 3. Capture Initial State BEFORE participant mutations
  SELECT count(*) INTO v_initial_attendee_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  SELECT * INTO v_plan_expense
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id
    AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND (title = 'Plan Fee' OR title = 'Plan Expense')))
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_plan_expense.id IS NOT NULL THEN
    SELECT amount_owed INTO v_initial_share
    FROM public.wallet_expense_participants
    WHERE expense_id = v_plan_expense.id AND amount_owed > 0
    ORDER BY amount_owed DESC
    LIMIT 1;

    IF v_initial_share IS NULL OR v_initial_share <= 0 THEN
      IF v_initial_attendee_count > 0 THEN
        v_initial_share := ROUND((v_plan_expense.total_amount / v_initial_attendee_count)::numeric, 2);
      ELSE
        v_initial_share := 0;
      END IF;
    END IF;
  ELSE
    v_initial_share := 0;
  END IF;

  -- 4. Process Additions
  IF p_users_to_add IS NOT NULL AND array_length(p_users_to_add, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_add LOOP
      INSERT INTO public.plan_participants (
        plan_id,
        user_id,
        role,
        rsvp_status,
        final_attendance,
        final_state,
        skip_reason,
        created_at,
        updated_at
      )
      VALUES (
        p_plan_id,
        v_target_user_id,
        'PARTICIPANT'::participant_role,
        'JOINED'::rsvp_status,
        'ATTENDED'::attendance_status,
        'JOINED'::rsvp_status,
        NULL,
        now(),
        now()
      )
      ON CONFLICT (plan_id, user_id) DO UPDATE SET
        rsvp_status = 'JOINED'::rsvp_status,
        final_attendance = 'ATTENDED'::attendance_status,
        final_state = 'JOINED'::rsvp_status,
        skip_reason = NULL,
        updated_at = now();
    END LOOP;
  END IF;

  -- 5. Process Removals
  IF p_users_to_remove IS NOT NULL AND array_length(p_users_to_remove, 1) > 0 THEN
    FOREACH v_target_user_id IN ARRAY p_users_to_remove LOOP
      -- Last-host check for removal
      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_target_user_id AND role = 'HOST'::participant_role
      ) THEN
        SELECT COUNT(*) INTO v_remaining_hosts
        FROM public.plan_participants
        WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND user_id <> v_target_user_id AND user_id <> ALL(p_users_to_remove);

        IF v_remaining_hosts < 1 THEN
          -- Prevent removing the last remaining host
          CONTINUE;
        END IF;
      END IF;

      UPDATE public.plan_participants
      SET
        rsvp_status = 'SKIPPED'::rsvp_status,
        final_attendance = 'DID_NOT_ATTEND'::attendance_status,
        final_state = 'SKIPPED'::rsvp_status,
        updated_at = now()
      WHERE plan_id = p_plan_id AND user_id = v_target_user_id;
    END LOOP;
  END IF;

  -- 6. Authoritative Final Attendance & Capacity Calculation
  SELECT count(*) INTO v_final_count
  FROM public.plan_participants
  WHERE plan_id = p_plan_id AND final_attendance = 'ATTENDED'::attendance_status;

  v_new_max_participants := GREATEST(coalesce(v_orig_max_participants, 1), v_final_count);

  -- 7. Expense Mode Recalculation
  IF v_plan_expense.id IS NOT NULL THEN
    IF p_expense_mode = 'KEEP_CURRENT_COST' THEN
      v_share := v_initial_share;
      v_new_total_cost := v_share * v_final_count;
    ELSIF p_expense_mode = 'SPLIT_ALL' THEN
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    ELSE
      v_new_total_cost := coalesce(v_plan_expense.total_amount, v_initial_total_cost, 0);
      IF v_final_count > 0 THEN
        v_share := ROUND((v_new_total_cost / v_final_count)::numeric, 2);
      ELSE
        v_share := 0;
      END IF;
    END IF;

    UPDATE public.wallet_expenses
    SET total_amount = v_new_total_cost, updated_at = now()
    WHERE id = v_plan_expense.id;

    -- Re-allocate per-person shares for ATTENDED members
    FOR v_participant IN
      SELECT pp.user_id, wep.id as wallet_part_id, wep.status as wallet_part_status, pp.skip_reason
      FROM public.plan_participants pp
      LEFT JOIN public.wallet_expense_participants wep
        ON wep.expense_id = v_plan_expense.id AND wep.user_id = pp.user_id
      WHERE pp.plan_id = p_plan_id
    LOOP
      IF v_participant.skip_reason = 'PAYMENT_KEPT' THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.plan_participants
        WHERE plan_id = p_plan_id AND user_id = v_participant.user_id AND final_attendance = 'ATTENDED'::attendance_status
      ) THEN
        IF v_participant.wallet_part_id IS NOT NULL THEN
          IF v_participant.wallet_part_status != 'SETTLED' THEN
            UPDATE public.wallet_expense_participants
            SET amount_owed = v_share, updated_at = now()
            WHERE id = v_participant.wallet_part_id;
          END IF;
        ELSE
          INSERT INTO public.wallet_expense_participants (
            expense_id,
            user_id,
            amount_owed,
            amount_paid,
            status,
            created_at,
            updated_at
          )
          VALUES (
            v_plan_expense.id,
            v_participant.user_id,
            v_share,
            0,
            'PENDING',
            now(),
            now()
          );
        END IF;
      ELSE
        IF v_participant.wallet_part_id IS NOT NULL AND v_participant.wallet_part_status != 'SETTLED' THEN
          DELETE FROM public.wallet_expense_participants WHERE id = v_participant.wallet_part_id;
        END IF;
      END IF;
    END LOOP;
  ELSE
    v_new_total_cost := v_initial_total_cost;
  END IF;

  -- 8. Update plan totals & counts
  UPDATE public.plans
  SET
    attended_participants = v_final_count,
    max_participants = v_new_max_participants,
    total_cost = coalesce(v_new_total_cost, total_cost),
    updated_at = now()
  WHERE id = p_plan_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'max_participants', v_new_max_participants,
    'attended_participants', v_final_count,
    'total_cost', coalesce(v_new_total_cost, v_initial_total_cost),
    'final_count', v_final_count
  );
END;
$$;


ALTER FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[], "p_expense_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_participant_to_waitlist_and_decrease_capacity"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id          UUID;
  v_current_max        INT;
  v_new_max            INT;
  v_target_row         RECORD;
  v_next_pos           INT;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can move participants to waitlist' USING ERRCODE = '40300';
  END IF;

  SELECT max_participants
    INTO v_current_max
    FROM public.plans
   WHERE id = p_plan_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT assigned_group, rsvp_status, role
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_row.role = 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Host cannot be moved to waitlist' USING ERRCODE = '40000';
  END IF;

  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_next_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum;

  v_new_max := GREATEST(2, v_current_max - 1);

  UPDATE public.plans
     SET max_participants = v_new_max,
         updated_at       = now()
   WHERE id = p_plan_id;

  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_next_pos,
         rsvp_status       = CASE
                               WHEN rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE rsvp_status
                             END,
         skip_reason       = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'plan_id',           p_plan_id,
    'target_user_id',    p_target_user_id,
    'new_capacity',      v_new_max,
    'waitlist_position', v_next_pos
  );
END;
$$;


ALTER FUNCTION "public"."move_participant_to_waitlist_and_decrease_capacity"("p_plan_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_waitlist_to_going"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id          UUID;
  v_max_participants   INT;
  v_total_cost         NUMERIC;
  v_target_status      rsvp_status;
  v_joined_count       INT := 0;
  v_active_count       INT := 0;
  v_new_cost           NUMERIC;
  v_filtering          TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only hosts can move waitlisted participants into Going' USING ERRCODE = '40300';
  END IF;

  SELECT max_participants, total_cost,
         COALESCE(participant_filtering::TEXT, 'AUTOMATIC')
    INTO v_max_participants, v_total_cost, v_filtering
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_filtering <> 'ASSIGNED' THEN
    RAISE EXCEPTION 'Manual queue movement is not allowed on Automatic plans'
      USING ERRCODE = '40300';
  END IF;

  SELECT rsvp_status
    INTO v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status = 'JOINED'::rsvp_status THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'user_id', p_target_user_id,
      'already_joined', true
    );
  END IF;

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    SELECT count(*)
      INTO v_joined_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_joined_count >= v_max_participants THEN
      RAISE EXCEPTION 'Going list is already full (% / %)', v_joined_count, v_max_participants
        USING ERRCODE = '40900';
    END IF;
  END IF;

  UPDATE public.plan_participants
     SET rsvp_status  = 'JOINED'::rsvp_status,
         skip_reason  = NULL,
         responded_at = now(),
         updated_at   = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    SELECT count(*)
      INTO v_active_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_active_count > 0 THEN
      v_new_cost := ROUND(v_total_cost / v_active_count, 2);

      UPDATE public.plan_participants
         SET cost_per_participant = v_new_cost,
             updated_at           = now()
       WHERE plan_id = p_plan_id AND rsvp_status = 'JOINED'::rsvp_status;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', p_target_user_id
  );
END;
$$;


ALTER FUNCTION "public"."move_waitlist_to_going"("p_plan_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Caller must be an active HOST
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may promote participants' USING ERRCODE = '40300';
  END IF;

  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_role = 'HOST'::participant_role THEN
    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_target_user_id,
      'already_host', true
    );
  END IF;

  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only Going participants can be promoted to host' USING ERRCODE = '40900';
  END IF;

  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_target_user_id;

  INSERT INTO public.plan_activity (
    plan_id,
    actor_id,
    target_user_id,
    activity_type,
    metadata
  ) VALUES (
    p_plan_id,
    v_caller_id,
    p_target_user_id,
    'host_promoted'::plan_activity_type,
    '{}'::jsonb
  );

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'promoted_user_id', p_target_user_id
  );
END;
$$;


ALTER FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rebuild_waitlist_queue"("p_plan_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_order_mode waitlist_order_mode_enum := 'AUTO'::waitlist_order_mode_enum;
  v_rec RECORD;
  v_seq INT := 1;
BEGIN
  -- Fetch plan order mode
  SELECT waitlist_order_mode INTO v_order_mode
    FROM public.plans
   WHERE id = p_plan_id;

  -- Step 1: Clear waitlist_position for any participant who shouldn't have one
  UPDATE public.plan_participants
     SET waitlist_position = NULL
   WHERE plan_id = p_plan_id
     AND (
       assigned_group = 'GOING'::assigned_group_enum
       OR rsvp_status IN ('SKIPPED'::rsvp_status, 'INVITED'::rsvp_status)
       OR (assigned_group IS NULL AND rsvp_status != 'WAITLISTED'::rsvp_status)
     )
     AND waitlist_position IS NOT NULL;

  -- Step 2: Renumber all active waitlist participants contiguously 1..N using FCFS + Alphabetical Fallback
  FOR v_rec IN
    SELECT pp.plan_id, pp.user_id
      FROM public.plan_participants pp
      LEFT JOIN public.users u ON u.id = pp.user_id
     WHERE pp.plan_id = p_plan_id
       AND pp.rsvp_status != 'SKIPPED'::rsvp_status
       AND (pp.assigned_group = 'WAITLIST'::assigned_group_enum OR (pp.assigned_group IS NULL AND pp.rsvp_status = 'WAITLISTED'::rsvp_status))
     ORDER BY
       CASE WHEN v_order_mode = 'CUSTOM'::waitlist_order_mode_enum THEN COALESCE(pp.waitlist_position, 2147483647) ELSE 2147483647 END ASC,
       pp.joined_queue_at ASC NULLS LAST,
       COALESCE(u.full_name, u.username, '') ASC
  LOOP
    UPDATE public.plan_participants
       SET waitlist_position = v_seq
     WHERE plan_id = v_rec.plan_id AND user_id = v_rec.user_id;

    v_seq := v_seq + 1;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rebuild_waitlist_queue"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_wallet_expenses"("p_plan_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_total_cost       NUMERIC;
  v_host_id          UUID;
  v_existing_payer   UUID;
  v_max_participants INTEGER;
  v_share            NUMERIC;
  v_expense_id       UUID;
BEGIN
  SELECT total_cost, max_participants
  INTO v_total_cost, v_max_participants
  FROM public.plans WHERE id = p_plan_id;

  UPDATE public.plan_participants SET cost_per_participant = NULL WHERE plan_id = p_plan_id;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    DELETE FROM public.wallet_expenses 
    WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'));
    RETURN;
  END IF;

  SELECT payer_id INTO v_existing_payer
  FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee'))
  LIMIT 1;

  IF v_existing_payer IS NOT NULL THEN
    v_host_id := v_existing_payer;
  ELSE
    SELECT user_id INTO v_host_id
    FROM public.plan_participants
    WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF v_host_id IS NULL THEN RETURN; END IF;

  IF v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
    v_share := ROUND((v_total_cost / v_max_participants)::NUMERIC, 2);
  ELSE
    SELECT COUNT(*) INTO v_max_participants
    FROM public.plan_participants
    WHERE plan_id = p_plan_id 
      AND rsvp_status = 'JOINED';
    v_share := CASE WHEN v_max_participants > 0
                    THEN ROUND((v_total_cost / v_max_participants)::NUMERIC, 2)
                    ELSE v_total_cost END;
  END IF;

  UPDATE public.plan_participants
  SET cost_per_participant = v_share
  WHERE plan_id = p_plan_id 
    AND rsvp_status = 'JOINED';

  SELECT id INTO v_expense_id FROM public.wallet_expenses
  WHERE plan_id = p_plan_id AND (expense_type = 'PLAN_EXPENSE' OR (message_id IS NULL AND title = 'Plan Fee')) LIMIT 1;

  IF v_expense_id IS NULL THEN
    INSERT INTO public.wallet_expenses (plan_id, payer_id, title, total_amount, status, expense_type)
    VALUES (p_plan_id, v_host_id, 'Plan Fee', v_total_cost, 'PENDING', 'PLAN_EXPENSE')
    RETURNING id INTO v_expense_id;
  ELSE
    UPDATE public.wallet_expenses
    SET total_amount = v_total_cost, expense_type = 'PLAN_EXPENSE', updated_at = NOW()
    WHERE id = v_expense_id;
  END IF;

  DELETE FROM public.wallet_expense_participants
  WHERE expense_id = v_expense_id
    AND status != 'SETTLED'
    AND user_id NOT IN (
      SELECT user_id FROM public.plan_participants
      WHERE plan_id = p_plan_id 
        AND (
          rsvp_status = 'JOINED'
          OR (rsvp_status = 'SKIPPED' AND skip_reason = 'PAYMENT_KEPT')
        )
    );

  INSERT INTO public.wallet_expense_participants (expense_id, user_id, amount_owed, amount_paid, status)
  SELECT v_expense_id, pp.user_id, v_share, 0, 'PENDING'
  FROM public.plan_participants pp
  WHERE pp.plan_id = p_plan_id 
    AND pp.rsvp_status = 'JOINED'
  ON CONFLICT (expense_id, user_id) DO UPDATE 
    SET amount_owed = EXCLUDED.amount_owed,
        status = CASE 
                   WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                   WHEN wallet_expense_participants.amount_paid >= EXCLUDED.amount_owed THEN 'SETTLED'
                   ELSE EXCLUDED.status 
                 END,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."recalculate_wallet_expenses"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rejoin_plan"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id UUID;
  v_participant RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT * INTO v_participant
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant record not found' USING ERRCODE = '40400';
  END IF;

  IF v_participant.rsvp_status <> 'SKIPPED'::rsvp_status THEN
    RAISE EXCEPTION 'Only skipped participants can request to rejoin' USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.plan_participants
     SET rsvp_status       = 'REJOINED'::rsvp_status,
         skip_reason       = NULL,
         leave_requested   = FALSE,
         leave_requested_at= NULL,
         responded_at      = now(),
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_caller_id,
    'status',  'REJOINED'
  );
END;
$$;


ALTER FUNCTION "public"."rejoin_plan"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_and_replace_participant"("p_plan_id" "uuid", "p_remove_user_id" "uuid", "p_promote_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_caller_id    UUID;
  v_caller_role  participant_role;
  v_waitlist_row RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT role INTO v_caller_role
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS DISTINCT FROM 'HOST'::participant_role THEN
    RAISE EXCEPTION 'Unauthorized: only the host can manage participants' USING ERRCODE = '40300';
  END IF;

  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_waitlist_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement participant not found' USING ERRCODE = '40400';
  END IF;

  DELETE FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_remove_user_id;

  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_waitlist_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                               ELSE v_waitlist_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_promote_user_id;

  RETURN jsonb_build_object(
    'success',          true,
    'removed_user_id',  p_remove_user_id,
    'promoted_user_id', p_promote_user_id
  );
END;
$$;


ALTER FUNCTION "public"."remove_and_replace_participant"("p_plan_id" "uuid", "p_remove_user_id" "uuid", "p_promote_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN public.remove_expense_participant_and_redistribute(p_expense_id, p_participant_user_id, 'SPLIT_SHARE'::text);
END;
$$;


ALTER FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid", "p_strategy" "text" DEFAULT 'SPLIT_SHARE'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id       UUID;
  v_payer_id        UUID;
  v_plan_id         UUID;
  v_total_amount    NUMERIC;
  v_expense_type    wallet_expense_type;
  v_pt_status       TEXT;
  v_pt_name         TEXT;
  v_remaining_count INT;
  v_base_share      NUMERIC;
  v_remainder       NUMERIC;
  v_new_total       NUMERIC := 0;
  v_curr_idx        INT := 0;
  v_rec             RECORD;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id, plan_id, message_id, title, total_amount, expense_type
    INTO v_payer_id, v_plan_id, v_rec.message_id, v_rec.title, v_total_amount, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id <> v_payer_id AND (v_plan_id IS NULL OR NOT public.is_plan_host(v_plan_id, v_caller_id)) THEN
    RAISE EXCEPTION 'Not authorized to modify this expense' USING ERRCODE = '40300';
  END IF;

  SELECT status INTO v_pt_status
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant is not part of this expense' USING ERRCODE = '40400';
  END IF;

  SELECT COALESCE(full_name, username, 'Participant') INTO v_pt_name
    FROM public.users WHERE id = p_participant_user_id;

  IF UPPER(COALESCE(v_pt_status, 'PENDING')) = 'SETTLED' THEN
    RAISE EXCEPTION 'Cannot remove settled split. % has already settled this expense.', v_pt_name USING ERRCODE = '40000';
  END IF;

  SELECT COUNT(*) INTO v_remaining_count
    FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id != p_participant_user_id;

  IF v_remaining_count <= 0 THEN
    RAISE EXCEPTION 'An expense must have at least one participant.' USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id AND user_id = p_participant_user_id;

  IF UPPER(COALESCE(p_strategy, 'SPLIT_SHARE')) = 'KEEP_SAME_SHARE' THEN
    SELECT COALESCE(SUM(amount_owed), 0) INTO v_new_total
      FROM public.wallet_expense_participants
     WHERE expense_id = p_expense_id;

    UPDATE public.wallet_expenses
       SET total_amount = v_new_total,
           updated_at = NOW()
     WHERE id = p_expense_id;

    IF v_expense_type = 'PLAN_EXPENSE' OR (v_rec.message_id IS NULL AND (v_rec.title = 'Plan Fee' OR v_rec.title = 'Plan Expense')) THEN
      UPDATE public.plans
         SET total_cost = v_new_total,
             updated_at = NOW()
       WHERE id = v_plan_id;
    END IF;
  ELSE
    v_base_share := TRUNC((v_total_amount / v_remaining_count)::numeric, 2);
    v_remainder := v_total_amount - (v_base_share * v_remaining_count);

    FOR v_rec IN 
      SELECT user_id FROM public.wallet_expense_participants
       WHERE expense_id = p_expense_id
       ORDER BY created_at ASC, user_id ASC
    LOOP
      v_curr_idx := v_curr_idx + 1;
      UPDATE public.wallet_expense_participants
         SET amount_owed = v_base_share + (CASE WHEN v_curr_idx = 1 THEN v_remainder ELSE 0 END),
             updated_at = NOW()
       WHERE expense_id = p_expense_id AND user_id = v_rec.user_id;
    END LOOP;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'removed_user_id', p_participant_user_id,
    'strategy', p_strategy,
    'remaining_count', v_remaining_count,
    'total_amount', CASE WHEN UPPER(COALESCE(p_strategy, 'SPLIT_SHARE')) = 'KEEP_SAME_SHARE' THEN v_new_total ELSE v_total_amount END
  );
END;
$$;


ALTER FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid", "p_strategy" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id              UUID;
  v_target_role            participant_role;
  v_target_status          rsvp_status;
  v_target_assigned_group  assigned_group_enum;
  v_target_leave_requested BOOLEAN;
  v_skip_reason            skip_reason;
  v_filtering_mode         participant_filtering_type;
  v_max_participants       INT;
  v_promoted_count         INT := 0;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can remove participants' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status, assigned_group, COALESCE(leave_requested, FALSE)
    INTO v_target_role, v_target_status, v_target_assigned_group, v_target_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot remove the last active host
  IF v_target_role = 'HOST'::participant_role AND v_target_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot remove the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  -- Determine skip_reason:
  -- If participant requested to leave (leave_requested = TRUE), skip_reason is 'LEFT' (voluntary leave).
  -- Otherwise, it is a host-initiated removal, so skip_reason is 'REMOVED'.
  IF v_target_leave_requested = TRUE THEN
    v_skip_reason := 'LEFT'::skip_reason;
  ELSE
    v_skip_reason := 'REMOVED'::skip_reason;
  END IF;

  PERFORM set_config('app.system_op', 'true', true);

  -- Transition target participant:
  -- If participant is still INVITED, delete their plan_participants row completely.
  -- Otherwise (e.g. JOINED, WAITLISTED), mark as SKIPPED with appropriate skip_reason.
  IF v_target_status = 'INVITED'::rsvp_status THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  ELSE
    UPDATE public.plan_participants
       SET rsvp_status       = 'SKIPPED'::rsvp_status,
           skip_reason       = v_skip_reason,
           assigned_group    = NULL,
           waitlist_position = NULL,
           role              = 'PARTICIPANT'::participant_role,
           leave_requested   = FALSE,
           leave_requested_at= NULL,
           responded_at      = now(),
           updated_at        = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
  END IF;

  -- If this was a leave request, resolve the pending activity if present
  IF v_target_leave_requested = TRUE THEN
    UPDATE public.plan_activity
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"RESOLVED"')
     WHERE plan_id = p_plan_id
       AND target_user_id = p_target_user_id
       AND activity_type = 'participant_left'::plan_activity_type
       AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING');
  END IF;

  -- Trigger appropriate waitlist promotion path
  IF v_max_participants IS NOT NULL THEN
    IF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      IF v_target_status = 'JOINED'::rsvp_status THEN
        v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);
      END IF;
    ELSIF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        v_promoted_count := public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'plan_id',          p_plan_id,
    'user_id',          p_target_user_id,
    'skip_reason',      CASE WHEN v_target_status = 'INVITED'::rsvp_status THEN NULL ELSE v_skip_reason END,
    'promoted_user_id', NULL,
    'promoted_count',   v_promoted_count
  );
END;
$$;


ALTER FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_waitlist"("p_plan_id" "uuid", "p_ordered_user_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- 1. Ensure target plan waitlist_order_mode is set to 'CUSTOM'
  UPDATE public.plans
  SET waitlist_order_mode = 'CUSTOM'
  WHERE id = p_plan_id 
    AND (waitlist_order_mode IS DISTINCT FROM 'CUSTOM');

  -- 2. Stage 1: Shift target waitlist positions to temporary offset (1000 + pos)
  --    Guarantees isolation and avoids unique index collision (23505) on (plan_id, waitlist_position)
  UPDATE public.plan_participants AS pp
  SET waitlist_position = 1000 + u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;

  -- 3. Stage 2: Set final 1-indexed waitlist positions
  UPDATE public.plan_participants AS pp
  SET waitlist_position = u.target_pos
  FROM (
    SELECT 
      user_id_val AS user_id, 
      pos_idx::INT AS target_pos
    FROM unnest(p_ordered_user_ids) WITH ORDINALITY AS t(user_id_val, pos_idx)
  ) AS u
  WHERE pp.plan_id = p_plan_id
    AND pp.user_id = u.user_id;

  -- 4. Ensure any participant assigned to GOING has waitlist_position = NULL
  UPDATE public.plan_participants
  SET waitlist_position = NULL
  WHERE plan_id = p_plan_id
    AND assigned_group = 'GOING'::assigned_group_enum
    AND waitlist_position IS NOT NULL;

END;
$$;


ALTER FUNCTION "public"."reorder_waitlist"("p_plan_id" "uuid", "p_ordered_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_replacement_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id              UUID;
  v_target_row             RECORD;
  v_replacement_row        RECORD;
  v_replacement_found      BOOLEAN := FALSE;
  v_target_was_going       BOOLEAN := FALSE;
  v_replacement_prev_pos   INT := NULL;
  v_filtering_mode         participant_filtering_type;
  v_remaining_hosts        INT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can replace participants' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  SELECT role, assigned_group, rsvp_status
    INTO v_target_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  -- Last host protection: Cannot replace the last active host
  IF v_target_row.role = 'HOST'::participant_role AND v_target_row.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> p_target_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'Cannot replace the last remaining active host' USING ERRCODE = '40300';
    END IF;
  END IF;

  v_target_was_going := (v_target_row.assigned_group = 'GOING'::assigned_group_enum OR v_target_row.rsvp_status = 'JOINED'::rsvp_status);

  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_replacement_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
   FOR UPDATE;

  v_replacement_found := FOUND;

  UPDATE public.plan_participants
     SET role               = 'PARTICIPANT'::participant_role,
         rsvp_status        = 'SKIPPED'::rsvp_status,
         skip_reason        = 'REPLACED'::skip_reason,
         assigned_group     = NULL,
         waitlist_position  = NULL,
         leave_requested    = FALSE,
         leave_requested_at = NULL,
         updated_at         = now()
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  IF v_replacement_found THEN
    v_replacement_prev_pos := v_replacement_row.waitlist_position;

    IF (v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_row.assigned_group = 'WAITLIST'::assigned_group_enum) OR
       (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_row.rsvp_status IN ('WAITLISTED'::rsvp_status)) THEN
       
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = CASE
                                     WHEN rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                     WHEN rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                                     ELSE rsvp_status
                                   END,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    ELSE
       UPDATE public.plan_participants
          SET assigned_group = CASE
                                 WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum
                                 WHEN v_target_was_going THEN NULL
                                 ELSE assigned_group
                               END,
              waitlist_position = CASE WHEN v_target_was_going THEN NULL ELSE waitlist_position END,
              rsvp_status       = 'INVITED'::rsvp_status,
              skip_reason       = NULL,
              leave_requested   = FALSE,
              leave_requested_at= NULL,
              updated_at        = now()
        WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
    END IF;

  ELSE
    INSERT INTO public.plan_participants (
      plan_id,
      user_id,
      role,
      rsvp_status,
      assigned_group,
      responded_at,
      skip_reason
    ) VALUES (
      p_plan_id,
      p_replacement_user_id,
      'PARTICIPANT'::participant_role,
      'INVITED'::rsvp_status,
      CASE WHEN v_target_was_going AND v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN 'GOING'::assigned_group_enum ELSE NULL END,
      NULL,
      NULL
    );
  END IF;

  IF v_replacement_prev_pos IS NOT NULL THEN
    WITH renumbered AS (
      SELECT user_id, ROW_NUMBER() OVER (ORDER BY waitlist_position ASC) AS new_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND waitlist_position IS NOT NULL
    )
    UPDATE public.plan_participants p
       SET waitlist_position = r.new_pos
      FROM renumbered r
     WHERE p.plan_id = p_plan_id AND p.user_id = r.user_id;
  END IF;

  RETURN jsonb_build_object(
    'success',             true,
    'plan_id',             p_plan_id,
    'target_user_id',      p_target_user_id,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;


ALTER FUNCTION "public"."replace_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_replacement_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id          UUID;
  v_caller_role        participant_role;
  v_caller_rsvp        rsvp_status;
  v_target_role        participant_role;
  v_target_rsvp        rsvp_status;
  v_total_cost         NUMERIC;
  v_leave_result       JSONB;
  v_activity_id        UUID;
BEGIN
  -- 1. Verify authentication
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify plan exists
  SELECT total_cost INTO v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 3. Verify caller is an active HOST
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id
     FOR UPDATE;

  IF NOT FOUND OR v_caller_role <> 'HOST'::participant_role OR v_caller_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only active hosts can perform host replacement leave' USING ERRCODE = '40300';
  END IF;

  -- 4. Verify replacement user
  IF p_replacement_user_id IS NULL OR p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'A valid different replacement user must be specified' USING ERRCODE = '40000';
  END IF;

  SELECT role, rsvp_status
    INTO v_target_role, v_target_rsvp
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Replacement user is not a participant in this plan' USING ERRCODE = '40400';
  END IF;

  -- Strictly enforce: ONLY currently JOINED participants can become hosts
  IF v_target_rsvp <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 5. Promote replacement to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id = p_replacement_user_id;

  -- Log host promotion activity
  INSERT INTO public.plan_activity (
    plan_id, actor_id, target_user_id, activity_type, metadata
  ) VALUES (
    p_plan_id, v_caller_id, p_replacement_user_id, 'host_promoted'::plan_activity_type, '{}'::jsonb
  );

  -- 6. Process caller leave based on plan pricing
  IF v_total_cost IS NOT NULL AND v_total_cost > 0 THEN
    -- Paid Plan -> create pending leave request for caller
    UPDATE public.plan_participants
       SET leave_requested    = TRUE,
           leave_requested_at = now(),
           updated_at         = now()
     WHERE plan_id = p_plan_id
       AND user_id = v_caller_id;

    INSERT INTO public.plan_activity (
      plan_id, actor_id, target_user_id, activity_type, metadata
    ) VALUES (
      p_plan_id,
      v_caller_id,
      v_caller_id,
      'participant_left'::plan_activity_type,
      jsonb_build_object(
        'status', 'PENDING',
        'requested_at', now(),
        'promoted_host_id', p_replacement_user_id
      )
    )
    RETURNING id INTO v_activity_id;

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', true,
      'is_paid_plan', true,
      'activity_id', v_activity_id
    );
  ELSE
    -- Free Plan -> execute immediate leave for caller
    v_leave_result := public.leave_plan(p_plan_id);

    RETURN jsonb_build_object(
      'success', true,
      'plan_id', p_plan_id,
      'promoted_user_id', p_replacement_user_id,
      'leave_requested', false,
      'is_paid_plan', false,
      'leave_details', v_leave_result
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id            UUID;
  v_total_cost         NUMERIC;
  v_current_rsvp       rsvp_status;
  v_current_role       participant_role;
  v_leave_requested    BOOLEAN;
  v_activity_id        UUID;
  v_remaining_hosts    INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT total_cost
    INTO v_total_cost
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF v_total_cost IS NULL OR v_total_cost <= 0 THEN
    RAISE EXCEPTION 'This feature is only for paid plans' USING ERRCODE = '40000';
  END IF;

  SELECT role, rsvp_status, leave_requested
    INTO v_current_role, v_current_rsvp, v_leave_requested
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_current_role = 'HOST'::participant_role AND v_current_rsvp = 'JOINED'::rsvp_status THEN
    SELECT COUNT(*)
      INTO v_remaining_hosts
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND role = 'HOST'::participant_role
       AND rsvp_status = 'JOINED'::rsvp_status
       AND user_id <> v_user_id;

    IF v_remaining_hosts < 1 THEN
      RAISE EXCEPTION 'The sole active host cannot submit a leave request' USING ERRCODE = '40300';
    END IF;
  END IF;

  IF v_current_rsvp != 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only joined participants can request to leave' USING ERRCODE = '40000';
  END IF;

  IF v_leave_requested IS TRUE THEN
    RAISE EXCEPTION 'Leave request is already pending' USING ERRCODE = '40000';
  END IF;

  UPDATE public.plan_participants
     SET leave_requested = TRUE,
         leave_requested_at = now(),
         updated_at = now()
   WHERE plan_id = p_plan_id AND user_id = v_user_id;

  INSERT INTO public.plan_activity (
    plan_id, actor_id, target_user_id, activity_type, metadata
  ) VALUES (
    p_plan_id,
    v_user_id,
    v_user_id,
    'participant_left'::plan_activity_type,
    jsonb_build_object('status', 'PENDING', 'requested_at', now())
  )
  RETURNING id INTO v_activity_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'user_id', v_user_id,
    'leave_requested', true,
    'activity_id', v_activity_id
  );
END;
$$;


ALTER FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id                  UUID;
  v_filtering_mode             participant_filtering_type;
  v_max_participants           INT;
  v_target_rsvp                rsvp_status;
  v_target_leave_req           BOOLEAN;
  v_target_assigned_group      assigned_group_enum;
  v_activity_id                UUID;
  v_expense_id                 UUID;
  v_replacement_rsvp           rsvp_status;
  v_replacement_assigned_group assigned_group_enum;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization check: Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Only the plan host can resolve leave requests' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering, 'AUTOMATIC'::participant_filtering_type), max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_resolution NOT IN ('REPLACED', 'KEEP_PAYMENT') THEN
    RAISE EXCEPTION 'Invalid resolution type. Must be REPLACED or KEEP_PAYMENT' USING ERRCODE = '40000';
  END IF;

  -- 2. Lock & fetch target participant details
  SELECT rsvp_status, leave_requested, assigned_group
    INTO v_target_rsvp, v_target_leave_req, v_target_assigned_group
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target participant not found in plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_leave_req IS NOT TRUE THEN
    RAISE EXCEPTION 'Participant does not have an active leave request' USING ERRCODE = '40000';
  END IF;

  SELECT id INTO v_activity_id
    FROM public.plan_activity
   WHERE plan_id = p_plan_id
     AND target_user_id = p_target_user_id
     AND activity_type = 'participant_left'::plan_activity_type
     AND (metadata->>'status' IS NULL OR metadata->>'status' = 'PENDING')
   ORDER BY created_at DESC
   LIMIT 1;

  -- 3. Transition target participant
  IF p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id IS NULL THEN
      RAISE EXCEPTION 'Replacement user ID is required for REPLACED resolution' USING ERRCODE = '40000';
    END IF;

    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'REPLACED'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    SELECT id INTO v_expense_id
      FROM public.wallet_expenses
     WHERE plan_id = p_plan_id AND message_id IS NULL
     LIMIT 1;

    IF v_expense_id IS NOT NULL THEN
      DELETE FROM public.wallet_expense_participants
       WHERE expense_id = v_expense_id
         AND user_id = p_target_user_id
         AND status != 'SETTLED'::wallet_expense_status;
    END IF;

    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'REPLACED',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;

  ELSIF p_resolution = 'KEEP_PAYMENT' THEN
    UPDATE public.plan_participants
       SET role               = 'PARTICIPANT'::participant_role,
           rsvp_status        = 'SKIPPED'::rsvp_status,
           skip_reason        = 'PAYMENT_KEPT'::skip_reason,
           leave_requested    = FALSE,
           leave_requested_at = NULL,
           assigned_group     = NULL,
           waitlist_position  = NULL,
           updated_at         = now()
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

    IF v_activity_id IS NOT NULL THEN
      UPDATE public.plan_activity
         SET metadata = jsonb_build_object(
               'status', 'RESOLVED',
               'resolution', 'KEEP_PAYMENT',
               'replacement_user_id', p_replacement_user_id,
               'resolved_at', now(),
               'resolved_by', v_caller_id
             )
       WHERE id = v_activity_id;
    END IF;

    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      IF v_target_assigned_group IS NOT NULL THEN
        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, v_target_assigned_group);
      END IF;
    ELSIF v_filtering_mode = 'AUTOMATIC'::participant_filtering_type THEN
      PERFORM public.auto_promote_waitlist_for_automatic(p_plan_id);
    END IF;
  END IF;

  -- 4. Handle replacement participant if REPLACED
  IF p_replacement_user_id IS NOT NULL AND p_resolution = 'REPLACED' THEN
    IF p_replacement_user_id = p_target_user_id THEN
      RAISE EXCEPTION 'Replacement user cannot be the same as the leaving participant' USING ERRCODE = '40000';
    END IF;

    SELECT rsvp_status, assigned_group INTO v_replacement_rsvp, v_replacement_assigned_group
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

    IF FOUND AND (v_replacement_assigned_group = 'GOING'::assigned_group_enum OR (v_filtering_mode = 'AUTOMATIC'::participant_filtering_type AND v_replacement_rsvp = 'JOINED'::rsvp_status)) THEN
      RAISE EXCEPTION 'Replacement user is already a joined participant' USING ERRCODE = '40000';
    END IF;

    IF NOT FOUND THEN
      INSERT INTO public.plan_participants (
        plan_id, user_id, rsvp_status, role, assigned_group, responded_at
      ) VALUES (
        p_plan_id, p_replacement_user_id, 'INVITED'::rsvp_status, 'PARTICIPANT'::participant_role,
        CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END, NULL
      );
    ELSE
      IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type AND v_replacement_assigned_group = 'WAITLIST'::assigned_group_enum THEN
        UPDATE public.plan_participants
           SET assigned_group     = v_target_assigned_group,
               rsvp_status        = CASE 
                                      WHEN rsvp_status = 'INVITED'::rsvp_status THEN 'INVITED'::rsvp_status
                                      WHEN rsvp_status = 'WAITLISTED'::rsvp_status AND v_target_assigned_group = 'GOING'::assigned_group_enum THEN 'JOINED'::rsvp_status 
                                      ELSE rsvp_status 
                                    END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

        PERFORM public.auto_promote_waitlist_for_assigned(p_plan_id, 'WAITLIST'::assigned_group_enum);
      ELSE
        UPDATE public.plan_participants
           SET rsvp_status        = 'INVITED'::rsvp_status,
               assigned_group     = CASE WHEN v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN v_target_assigned_group ELSE NULL END,
               waitlist_position  = NULL,
               skip_reason        = NULL,
               leave_requested    = FALSE,
               leave_requested_at = NULL,
               updated_at         = now()
         WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'target_user_id', p_target_user_id,
    'resolution', p_resolution,
    'replacement_user_id', p_replacement_user_id
  );
END;
$$;


ALTER FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_rejoined_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_decision" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id             UUID;
  v_target_role           participant_role;
  v_target_status         rsvp_status;
  v_filtering_mode        participant_filtering_type;
  v_max_pos               INT;
  v_decision              TEXT;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts can resolve rejoin requests' USING ERRCODE = '40300';
  END IF;

  SELECT participant_filtering
    INTO v_filtering_mode
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- Lock and inspect target participant
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_target_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participant not found' USING ERRCODE = '40400';
  END IF;

  IF v_target_status <> 'REJOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Participant is not in REJOINED status' USING ERRCODE = '40000';
  END IF;

  v_decision := UPPER(TRIM(p_decision));

  PERFORM set_config('app.system_op', 'true', true);

  IF v_decision = 'JOINED' THEN
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = 'GOING'::assigned_group_enum,
             waitlist_position = NULL,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    ELSE
      UPDATE public.plan_participants
         SET rsvp_status       = 'JOINED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'WAITLIST' OR v_decision = 'WAITLISTED' THEN
    IF v_filtering_mode = 'ASSIGNED'::participant_filtering_type THEN
      SELECT COALESCE(MAX(waitlist_position), 0)
        INTO v_max_pos
        FROM public.plan_participants
       WHERE plan_id = p_plan_id
         AND assigned_group = 'WAITLIST'::assigned_group_enum
         AND user_id <> p_target_user_id;

      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = 'WAITLIST'::assigned_group_enum,
             waitlist_position = v_max_pos + 1,
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    ELSE
      UPDATE public.plan_participants
         SET rsvp_status       = 'WAITLISTED'::rsvp_status,
             assigned_group    = NULL,
             waitlist_position = NULL,
             joined_queue_at   = now(),
             skip_reason       = NULL,
             responded_at      = now(),
             updated_at        = now()
       WHERE plan_id = p_plan_id AND user_id = p_target_user_id;
    END IF;

  ELSIF v_decision = 'REMOVE' THEN
    DELETE FROM public.plan_participants
     WHERE plan_id = p_plan_id AND user_id = p_target_user_id;

  ELSE
    PERFORM set_config('app.system_op', 'false', true);
    RAISE EXCEPTION 'Invalid decision: % (must be JOINED, WAITLISTED, or REMOVE)', p_decision USING ERRCODE = '40000';
  END IF;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',  true,
    'plan_id',  p_plan_id,
    'user_id',  p_target_user_id,
    'decision', v_decision
  );
END;
$$;


ALTER FUNCTION "public"."resolve_rejoined_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_decision" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_participant_cost_share_on_join"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_total_cost NUMERIC(10,2);
  v_max_participants INT;
BEGIN
  IF NEW.rsvp_status = 'JOINED'::rsvp_status THEN
    SELECT total_cost, max_participants
      INTO v_total_cost, v_max_participants
      FROM public.plans
     WHERE id = NEW.plan_id;

    IF v_total_cost IS NOT NULL AND v_total_cost > 0 AND v_max_participants IS NOT NULL AND v_max_participants > 0 THEN
      NEW.cost_per_participant := ROUND(v_total_cost / v_max_participants, 2);
    ELSE
      NEW.cost_per_participant := 0;
    END IF;
  ELSE
    NEW.cost_per_participant := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_participant_cost_share_on_join"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_wallet_expense_participants_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_wallet_expense_participants_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_wallet_transactions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_wallet_transactions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_wallet_expense"("p_expense_id" "uuid", "p_debtor_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id    UUID;
  v_payer_id     UUID;
  v_settled_rows INTEGER := 0;
  v_all_settled  BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id INTO v_payer_id
  FROM public.wallet_expenses
  WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  -- Verify caller is creditor (payer_id) or plan host
  IF v_caller_id != v_payer_id AND NOT public.is_plan_host((SELECT plan_id FROM public.wallet_expenses WHERE id = p_expense_id), v_caller_id) THEN
    RAISE EXCEPTION 'Only the creditor can settle this expense' USING ERRCODE = '40300';
  END IF;

  -- Update target participant obligation(s) to SETTLED
  WITH target_rows AS (
    SELECT id FROM public.wallet_expense_participants
    WHERE expense_id = p_expense_id
      AND (p_debtor_id IS NULL OR user_id = p_debtor_id)
      AND status != 'SETTLED'
  ),
  updated_rows AS (
    UPDATE public.wallet_expense_participants
    SET status = 'SETTLED',
        updated_at = now()
    WHERE id IN (SELECT id FROM target_rows)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_settled_rows FROM updated_rows;

  -- Check if all participants for this expense are now SETTLED
  SELECT COALESCE(bool_and(status = 'SETTLED'), false)
  INTO v_all_settled
  FROM public.wallet_expense_participants
  WHERE expense_id = p_expense_id;

  IF v_all_settled THEN
    UPDATE public.wallet_expenses
    SET status = 'SETTLED',
        updated_at = now()
    WHERE id = p_expense_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'settled_count', v_settled_rows,
    'expense_id', p_expense_id,
    'creditor_id', v_caller_id,
    'debtor_id', p_debtor_id
  );
END;
$$;


ALTER FUNCTION "public"."settle_wallet_expense"("p_expense_id" "uuid", "p_debtor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."settle_wallet_relationship"("p_debtor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id    UUID;
  v_settled_rows INTEGER := 0;
  v_exp_row      RECORD;
  v_all_settled  BOOLEAN;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  IF p_debtor_id IS NULL THEN
    RAISE EXCEPTION 'Other user ID is required' USING ERRCODE = '40000';
  END IF;

  IF v_caller_id = p_debtor_id THEN
    RAISE EXCEPTION 'Self settlement is not allowed' USING ERRCODE = '40000';
  END IF;

  -- 1. Settle all non-settled participant obligations between caller and p_debtor_id in BOTH directions:
  --    (Caller paid, p_debtor_id owes) OR (p_debtor_id paid, Caller owes)
  WITH target_rows AS (
    SELECT mep.id, mep.expense_id
    FROM public.wallet_expense_participants mep
    JOIN public.wallet_expenses me ON me.id = mep.expense_id
    WHERE mep.status != 'SETTLED'
      AND mep.amount_owed > 0
      AND (
        (me.payer_id = v_caller_id AND mep.user_id = p_debtor_id)
        OR
        (me.payer_id = p_debtor_id AND mep.user_id = v_caller_id)
      )
  ),
  updated_rows AS (
    UPDATE public.wallet_expense_participants mep
    SET status = 'SETTLED',
        updated_at = now()
    FROM target_rows tr
    WHERE mep.id = tr.id
    RETURNING mep.expense_id
  )
  SELECT COUNT(*) INTO v_settled_rows FROM updated_rows;

  -- 2. For every affected expense, check if all participants are now SETTLED.
  -- If so, update parent wallet_expenses status to SETTLED.
  FOR v_exp_row IN
    SELECT DISTINCT me.id
    FROM public.wallet_expenses me
    JOIN public.wallet_expense_participants mep ON mep.expense_id = me.id
    WHERE (
      (me.payer_id = v_caller_id AND mep.user_id = p_debtor_id)
      OR
      (me.payer_id = p_debtor_id AND mep.user_id = v_caller_id)
    )
  LOOP
    SELECT COALESCE(bool_and(mep.status = 'SETTLED'), false)
    INTO v_all_settled
    FROM public.wallet_expense_participants mep
    WHERE mep.expense_id = v_exp_row.id;

    IF v_all_settled THEN
      UPDATE public.wallet_expenses
      SET status = 'SETTLED',
          updated_at = now()
      WHERE id = v_exp_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'settled_count', v_settled_rows,
    'caller_id', v_caller_id,
    'other_user_id', p_debtor_id
  );
END;
$$;


ALTER FUNCTION "public"."settle_wallet_relationship"("p_debtor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_caller_role   participant_role;
  v_caller_status rsvp_status;
  v_target_role   participant_role;
  v_target_status rsvp_status;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 1. Authorization: Caller must be an active HOST (role = 'HOST', rsvp_status = 'JOINED')
  SELECT role, rsvp_status
    INTO v_caller_role, v_caller_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role <> 'HOST'::participant_role OR v_caller_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Unauthorized: Only active hosts may perform stop hosting replacement' USING ERRCODE = '40300';
  END IF;

  -- 2. Cannot replace host with self
  IF p_replacement_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot replace host with self' USING ERRCODE = '40000';
  END IF;

  -- 3. Validate replacement candidate: must be member, role = 'PARTICIPANT', rsvp_status = 'JOINED'
  SELECT role, rsvp_status
    INTO v_target_role, v_target_status
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_replacement_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user is not a participant of this plan' USING ERRCODE = '40400';
  END IF;

  IF v_target_status <> 'JOINED'::rsvp_status THEN
    RAISE EXCEPTION 'Only currently joined participants can become hosts' USING ERRCODE = '40000';
  END IF;

  -- 4. Promote replacement participant to HOST
  UPDATE public.plan_participants
     SET role       = 'HOST'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = p_replacement_user_id;

  -- 5. Demote caller to PARTICIPANT (maintaining JOINED status, NO leave request)
  UPDATE public.plan_participants
     SET role       = 'PARTICIPANT'::participant_role,
         updated_at = now()
   WHERE plan_id = p_plan_id
     AND user_id  = v_caller_id;

  -- 6. Log host promotion activity
  BEGIN
    INSERT INTO public.plan_activity (
      plan_id,
      user_id,
      activity_type,
      metadata,
      created_at
    ) VALUES (
      p_plan_id,
      v_caller_id,
      'host_promoted'::plan_activity_type,
      jsonb_build_object(
        'promoted_user_id', p_replacement_user_id,
        'action', 'stop_hosting_replacement'
      ),
      now()
    );
  EXCEPTION WHEN OTHERS THEN
    -- Non-blocking activity logging
  END;

  RETURN jsonb_build_object(
    'success',                  true,
    'plan_id',                  p_plan_id,
    'new_host_id',              p_replacement_user_id,
    'demoted_caller_id',        v_caller_id,
    'caller_role',              'PARTICIPANT',
    'caller_status',            'JOINED'
  );
END;
$$;


ALTER FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."swap_plan_participants"("p_plan_id" "uuid", "p_going_user_id" "uuid", "p_waitlist_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id      UUID;
  v_going_row      RECORD;
  v_waitlist_row   RECORD;
  v_new_waitlist_pos INT;
BEGIN
  -- 1. Auth check
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- 2. Verify caller is active HOST of this plan
  IF NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Unauthorized: only hosts can swap participants' USING ERRCODE = '40300';
  END IF;

  -- 3. Fetch both current participant rows (lock for update)
  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_going_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_going_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Going participant not found' USING ERRCODE = '40400';
  END IF;

  SELECT assigned_group, rsvp_status, waitlist_position
    INTO v_waitlist_row
    FROM public.plan_participants
   WHERE plan_id = p_plan_id AND user_id = p_waitlist_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Waitlist participant not found' USING ERRCODE = '40400';
  END IF;

  -- 4. Compute a safe new waitlist position for the GOING→WAITLIST participant
  SELECT COALESCE(MAX(waitlist_position), 0) + 1
    INTO v_new_waitlist_pos
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'WAITLIST'::assigned_group_enum
     AND user_id <> p_waitlist_user_id;

  PERFORM set_config('app.system_op', 'true', true);

  -- 5a. First clear the waitlist participant's position to avoid unique collision and promote to GOING
  UPDATE public.plan_participants
     SET assigned_group    = 'GOING'::assigned_group_enum,
         waitlist_position = NULL,
         rsvp_status       = CASE
                               WHEN v_waitlist_row.rsvp_status = 'WAITLISTED'::rsvp_status THEN 'JOINED'::rsvp_status
                               WHEN v_waitlist_row.rsvp_status = 'REJOINED'::rsvp_status THEN 'JOINED'::rsvp_status
                               ELSE v_waitlist_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_waitlist_user_id;

  -- 5b. Then move the going participant to the waitlist
  UPDATE public.plan_participants
     SET assigned_group    = 'WAITLIST'::assigned_group_enum,
         waitlist_position = v_new_waitlist_pos,
         rsvp_status       = CASE
                               WHEN v_going_row.rsvp_status = 'JOINED'::rsvp_status THEN 'WAITLISTED'::rsvp_status
                               ELSE v_going_row.rsvp_status
                             END,
         skip_reason       = NULL,
         updated_at        = now()
   WHERE plan_id = p_plan_id AND user_id = p_going_user_id;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success',          true,
    'going_user_id',    p_going_user_id,
    'waitlist_user_id', p_waitlist_user_id,
    'new_waitlist_pos', v_new_waitlist_pos
  );
END;
$$;


ALTER FUNCTION "public"."swap_plan_participants"("p_plan_id" "uuid", "p_going_user_id" "uuid", "p_waitlist_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."switch_to_automatic_waitlist_mode"("p_plan_id" "uuid", "p_promoted_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_filtering_mode           participant_filtering_type;
  v_max_participants         INT;
  v_going_count              INT;
  v_vacant_spots             INT;
  v_promoted_count           INT;
  v_valid_promoted_count     INT;
BEGIN
  -- 1. Lock and fetch target plan settings
  SELECT participant_filtering, max_participants
    INTO v_filtering_mode, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  -- 2. Verify plan is currently in ASSIGNED filtering mode
  IF v_filtering_mode <> 'ASSIGNED'::participant_filtering_type THEN
    RAISE EXCEPTION 'Plan is not in ASSIGNED waitlist mode' USING ERRCODE = '40000';
  END IF;

  -- 3. Calculate current GOING count and vacant spots
  SELECT COUNT(*) INTO v_going_count
    FROM public.plan_participants
   WHERE plan_id = p_plan_id
     AND assigned_group = 'GOING'::assigned_group_enum;

  v_vacant_spots := GREATEST(0, v_max_participants - v_going_count);
  v_promoted_count := COALESCE(array_length(p_promoted_user_ids, 1), 0);

  -- 4. Validation when vacant spots exist
  IF v_vacant_spots > 0 THEN
    IF v_promoted_count <> v_vacant_spots THEN
      RAISE EXCEPTION 'Must select exactly % participants to fill available GOING spots (received %)', 
        v_vacant_spots, v_promoted_count USING ERRCODE = '40001';
    END IF;

    -- Validate that all selected user IDs exist in WAITLIST group with rsvp_status = 'JOINED'
    SELECT COUNT(*) INTO v_valid_promoted_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids)
       AND assigned_group = 'WAITLIST'::assigned_group_enum
       AND rsvp_status = 'JOINED'::rsvp_status;

    IF v_valid_promoted_count <> v_promoted_count THEN
      RAISE EXCEPTION 'One or more selected participants are not eligible for promotion (must be WAITLIST + JOINED)'
        USING ERRCODE = '40002';
    END IF;

    -- Promote selected participants to GOING and clear waitlist_position
    UPDATE public.plan_participants
       SET assigned_group = 'GOING'::assigned_group_enum,
           waitlist_position = NULL,
           updated_at = now()
     WHERE plan_id = p_plan_id
       AND user_id = ANY(p_promoted_user_ids);
  END IF;

  -- 5. Switch plan participant_filtering to AUTOMATIC
  UPDATE public.plans
     SET participant_filtering = 'AUTOMATIC'::participant_filtering_type
   WHERE id = p_plan_id;

END;
$$;


ALTER FUNCTION "public"."switch_to_automatic_waitlist_mode"("p_plan_id" "uuid", "p_promoted_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_plan_participant_cost_share"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_share NUMERIC(10,2) := 0;
BEGIN
  -- Compute per participant share from NEW total_cost and max_participants
  IF NEW.total_cost IS NOT NULL AND NEW.total_cost > 0 AND NEW.max_participants IS NOT NULL AND NEW.max_participants > 0 THEN
    v_share := ROUND(NEW.total_cost / NEW.max_participants, 2);
  ELSE
    v_share := 0;
  END IF;

  -- Update active (JOINED) participants
  UPDATE public.plan_participants
     SET cost_per_participant = v_share,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status = 'JOINED'::rsvp_status;

  -- Clear non-active participants
  UPDATE public.plan_participants
     SET cost_per_participant = NULL,
         updated_at = now()
   WHERE plan_id = NEW.id AND rsvp_status != 'JOINED'::rsvp_status;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_plan_participant_cost_share"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_circle_ownership"("p_circle_id" "uuid", "p_old_host_id" "uuid", "p_new_host_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE circle_members SET role = 'admin'::circle_role WHERE circle_id = p_circle_id AND user_id = p_old_host_id;
    UPDATE circle_members SET role = 'creator_admin'::circle_role WHERE circle_id = p_circle_id AND user_id = p_new_host_id;
    UPDATE circles SET created_by = p_new_host_id WHERE id = p_circle_id;
END; $$;


ALTER FUNCTION "public"."transfer_circle_ownership"("p_circle_id" "uuid", "p_old_host_id" "uuid", "p_new_host_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_auto_promote_on_vacancy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Only react when a JOINED row leaves Going
  IF OLD.rsvp_status = 'JOINED'::rsvp_status AND NEW.rsvp_status != 'JOINED'::rsvp_status THEN
    PERFORM public.auto_promote_waitlist_for_automatic(NEW.plan_id);
  END IF;
  RETURN NULL; -- AFTER triggers ignore return value for row-level
END;
$$;


ALTER FUNCTION "public"."trg_auto_promote_on_vacancy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_block_manual_queue_move_on_automatic"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_filtering TEXT;
BEGIN
  -- Only care about rsvp_status changes between JOINED and WAITLISTED
  IF OLD.rsvp_status = NEW.rsvp_status THEN
    RETURN NEW;
  END IF;

  -- Only intercept JOINED ↔ WAITLISTED transitions
  IF NOT (
    (OLD.rsvp_status = 'JOINED'    AND NEW.rsvp_status = 'WAITLISTED') OR
    (OLD.rsvp_status = 'WAITLISTED' AND NEW.rsvp_status = 'JOINED')
  ) THEN
    RETURN NEW;
  END IF;

  -- Allow updates originating from within a PL/pgSQL function or trigger (depth > 1)
  -- or if current session setting 'app.system_op' is set, or if running as superuser/postgres.
  IF pg_trigger_depth() > 1 OR current_user = 'postgres' OR current_setting('app.system_op', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Check the plan's filtering mode
  v_filtering := public.get_plan_participant_filtering(NEW.plan_id);

  -- Allow all moves on ASSIGNED plans
  IF v_filtering = 'ASSIGNED' THEN
    RETURN NEW;
  END IF;

  -- Block direct authenticated client-initiated SQL updates (e.g. supabase.from('plan_participants').update(...))
  RAISE EXCEPTION
    'Manual queue movement is not allowed on plans with AUTOMATIC participant filtering. '
    'Going ↔ Waitlist transitions are managed automatically by the system. '
    '(plan_id: %, user_id: %, old_status: %, new_status: %)',
    NEW.plan_id, NEW.user_id, OLD.rsvp_status, NEW.rsvp_status
  USING ERRCODE = '40300';
END;
$$;


ALTER FUNCTION "public"."trg_block_manual_queue_move_on_automatic"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_enforce_waitlist_position_invariant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.assigned_group = 'GOING'::assigned_group_enum OR NEW.rsvp_status = 'SKIPPED'::rsvp_status THEN
    NEW.waitlist_position := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_enforce_waitlist_position_invariant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_maintain_joined_queue_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.joined_queue_at IS NULL THEN
      NEW.joined_queue_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- If rsvp_status transitions to JOINED or WAITLISTED from INVITED or SKIPPED, update timestamp
    IF NEW.rsvp_status IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)
       AND (OLD.rsvp_status IS NULL OR OLD.rsvp_status NOT IN ('JOINED'::rsvp_status, 'WAITLISTED'::rsvp_status)) THEN
      NEW.joined_queue_at := now();
    ELSIF NEW.joined_queue_at IS NULL THEN
      NEW.joined_queue_at := COALESCE(OLD.joined_queue_at, OLD.created_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_maintain_joined_queue_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_preserve_payment_kept_skip_reason"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only preserve PAYMENT_KEPT if they are STILL in the SKIPPED state.
  -- If they are transitioning to JOINED, INVITED, etc., let it be cleared.
  IF OLD.skip_reason = 'PAYMENT_KEPT'::skip_reason 
     AND NEW.skip_reason IS NULL 
     AND NEW.rsvp_status = 'SKIPPED' THEN
    NEW.skip_reason := 'PAYMENT_KEPT'::skip_reason;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_preserve_payment_kept_skip_reason"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.role = 'HOST'::participant_role AND (NEW.rsvp_status = 'WAITLISTED'::rsvp_status OR NEW.rsvp_status = 'SKIPPED'::rsvp_status) THEN
    NEW.role := 'PARTICIPANT'::participant_role;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_enforce_skip_reason_null"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF NEW.rsvp_status IN ('JOINED', 'INVITED', 'WAITLISTED') THEN
        NEW.skip_reason = NULL;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_enforce_skip_reason_null"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_cost_expense"("p_expense_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_plan_id" "uuid", "p_participant_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller_id     UUID;
  v_payer_id      UUID;
  v_message_id    UUID;
  v_old_title     TEXT;
  v_expense_type  wallet_expense_type;
  v_count         INT;
  v_share         NUMERIC;
  v_pid           UUID;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  SELECT payer_id, message_id, title, expense_type
    INTO v_payer_id, v_message_id, v_old_title, v_expense_type
    FROM public.wallet_expenses
   WHERE id = p_expense_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = '40400';
  END IF;

  IF v_caller_id <> v_payer_id AND NOT public.is_plan_host(p_plan_id, v_caller_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this expense' USING ERRCODE = '40300';
  END IF;

  v_count := array_length(p_participant_ids, 1);
  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'At least one participant is required' USING ERRCODE = '40000';
  END IF;

  v_share := ROUND((p_total_amount / v_count)::numeric, 2);

  PERFORM set_config('app.system_op', 'true', true);

  UPDATE public.wallet_expenses
     SET title = p_title,
         total_amount = p_total_amount,
         plan_id = p_plan_id,
         updated_at = NOW()
   WHERE id = p_expense_id;

  IF v_expense_type = 'PLAN_EXPENSE' OR (v_message_id IS NULL AND (v_old_title = 'Plan Fee' OR v_old_title = 'Plan Expense')) THEN
    UPDATE public.plans
       SET total_cost = p_total_amount,
           updated_at = NOW()
     WHERE id = p_plan_id;
  END IF;

  DELETE FROM public.wallet_expense_participants
   WHERE expense_id = p_expense_id
     AND status != 'SETTLED'
     AND user_id != ALL(p_participant_ids);

  FOREACH v_pid IN ARRAY p_participant_ids LOOP
    INSERT INTO public.wallet_expense_participants (
      expense_id,
      user_id,
      amount_owed,
      amount_paid,
      status,
      created_at,
      updated_at
    )
    VALUES (
      p_expense_id,
      v_pid,
      v_share,
      0,
      'PENDING',
      NOW(),
      NOW()
    )
    ON CONFLICT (expense_id, user_id) DO UPDATE
       SET amount_owed = EXCLUDED.amount_owed,
           status = CASE 
                      WHEN wallet_expense_participants.status = 'SETTLED' THEN 'SETTLED'
                      ELSE EXCLUDED.status
                    END,
           updated_at = NOW();
  END LOOP;

  PERFORM set_config('app.system_op', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'expense_id', p_expense_id,
    'total_amount', p_total_amount,
    'share', v_share
  );
END;
$$;


ALTER FUNCTION "public"."update_cost_expense"("p_expense_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_plan_id" "uuid", "p_participant_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_plan_capacity"("p_plan_id" "uuid", "p_max_participants" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id            UUID;
  v_filtering          TEXT;
  v_max_participants   INT;
  v_promoted_count     INT := 0;
  v_demoted_count      INT := 0;
  v_host_count         INT := 0;
BEGIN
  PERFORM set_config('app.system_op', 'true', true);

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '40100';
  END IF;

  -- Caller must be an active host
  IF NOT public.is_plan_host(p_plan_id, v_user_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only hosts can update plan capacity' USING ERRCODE = '40300';
  END IF;

  SELECT COALESCE(participant_filtering::TEXT, 'AUTOMATIC'), max_participants
    INTO v_filtering, v_max_participants
    FROM public.plans
   WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = '40400';
  END IF;

  IF p_max_participants IS NULL OR p_max_participants < 1 THEN
    RAISE EXCEPTION 'Plan size must be at least 1' USING ERRCODE = '42601';
  END IF;

  IF v_max_participants IS NOT NULL AND p_max_participants > v_max_participants THEN
    RAISE EXCEPTION 'Plan size (%) cannot exceed invitation capacity (%)', p_max_participants, v_max_participants USING ERRCODE = '42601';
  END IF;

  -- Update plan_size (the actual joined capacity)
  UPDATE public.plans
     SET plan_size   = p_max_participants,
         updated_at  = now()
   WHERE id = p_plan_id;

  IF v_filtering != 'ASSIGNED' THEN
    -- 1. Capacity decrease: demote overflow JOINED participants to WAITLISTED
    SELECT COUNT(*) INTO v_host_count
      FROM public.plan_participants
     WHERE plan_id = p_plan_id AND role = 'HOST'::participant_role AND rsvp_status = 'JOINED'::rsvp_status;

    WITH ranked_joined AS (
      SELECT pp.user_id,
             ROW_NUMBER() OVER (
               ORDER BY pp.joined_queue_at ASC NULLS LAST,
                        COALESCE(u.full_name, u.username, '') ASC
             ) AS pos
        FROM public.plan_participants pp
        LEFT JOIN public.users u ON u.id = pp.user_id
       WHERE pp.plan_id = p_plan_id
         AND pp.rsvp_status = 'JOINED'::rsvp_status
         AND pp.role != 'HOST'::participant_role
    )
    UPDATE public.plan_participants pp
       SET rsvp_status = 'WAITLISTED'::rsvp_status,
           updated_at  = now()
      FROM ranked_joined rj
     WHERE pp.plan_id = p_plan_id
       AND pp.user_id = rj.user_id
       AND rj.pos > GREATEST(0, p_max_participants - v_host_count);

    GET DIAGNOSTICS v_demoted_count = ROW_COUNT;

    -- 2. Capacity increase: promote waitlisted participants if spots available (FCFS order)
    v_promoted_count := public.auto_promote_waitlist_for_automatic(p_plan_id);

    -- Recalculate waitlist queue positions
    PERFORM public.rebuild_waitlist_queue(p_plan_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', p_plan_id,
    'new_plan_size', p_max_participants,
    'promoted_count', v_promoted_count,
    'demoted_count', v_demoted_count
  );
END;
$$;


ALTER FUNCTION "public"."update_plan_capacity"("p_plan_id" "uuid", "p_max_participants" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_friends_count"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'ACCEPTED' THEN
      UPDATE users SET friends = GREATEST(0, (
        SELECT COUNT(*) FROM friendships 
        WHERE (user_1_id = users.id OR user_2_id = users.id) AND status = 'ACCEPTED'
      )) WHERE id IN (NEW.user_1_id, NEW.user_2_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      UPDATE users SET friends = GREATEST(0, (
        SELECT COUNT(*) FROM friendships 
        WHERE (user_1_id = users.id OR user_2_id = users.id) AND status = 'ACCEPTED'
      )) WHERE id IN (NEW.user_1_id, NEW.user_2_id, OLD.user_1_id, OLD.user_2_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'ACCEPTED' THEN
      UPDATE users SET friends = GREATEST(0, (
        SELECT COUNT(*) FROM friendships 
        WHERE (user_1_id = users.id OR user_2_id = users.id) AND status = 'ACCEPTED'
      )) WHERE id IN (OLD.user_1_id, OLD.user_2_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."update_user_friends_count"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."discovery_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_id" "text" DEFAULT "public"."generate_discovery_public_id"() NOT NULL,
    "section_id" "uuid",
    "title" "text" NOT NULL,
    "category" "public"."discovery_category" NOT NULL,
    "subcategory" "text",
    "description" "text",
    "cover_image_url" "text",
    "location" "text",
    "suggested_duration_minutes" integer,
    "suggested_cost_amount" numeric DEFAULT 0,
    "suggested_capacity" integer,
    "default_rsvp_offset_minutes" integer DEFAULT 60,
    "display_order" integer DEFAULT 0,
    "featured" boolean DEFAULT false,
    "status" "public"."discovery_status" DEFAULT 'ACTIVE'::"public"."discovery_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "place_id" "text",
    "latitude" double precision,
    "longitude" double precision,
    "place_name" "text",
    "place_address" "text"
);


ALTER TABLE "public"."discovery_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."discovery_public_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."discovery_public_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discovery_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_id" "text" NOT NULL,
    "category" "public"."discovery_category" NOT NULL,
    "display_order" integer DEFAULT 0,
    "status" "public"."discovery_status" DEFAULT 'ACTIVE'::"public"."discovery_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "subcategory" "text"
);


ALTER TABLE "public"."discovery_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_1_id" "uuid" NOT NULL,
    "user_2_id" "uuid" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "created_from_plan_id" "uuid",
    "status" "public"."friendship_status" DEFAULT 'PENDING'::"public"."friendship_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "check_canonical_order" CHECK (("user_1_id" < "user_2_id")),
    CONSTRAINT "check_requested_by" CHECK ((("requested_by" = "user_1_id") OR ("requested_by" = "user_2_id")))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "memory_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "editable_until" timestamp with time zone,
    "locked_at" timestamp with time zone
);


ALTER TABLE "public"."memories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memory_results" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "memory_id" "uuid" NOT NULL,
    "score_home" integer,
    "score_away" integer,
    "mvp_user_id" "uuid",
    "average_rating" numeric(3,1),
    "review" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."memory_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "related_plan_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "target_user_id" "uuid",
    "activity_type" "public"."plan_activity_type" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_activity" OWNER TO "postgres";


COMMENT ON TABLE "public"."plan_activity" IS 'Append-only historical audit log and activity timeline for plans.';



COMMENT ON COLUMN "public"."plan_activity"."id" IS 'Primary key UUID.';



COMMENT ON COLUMN "public"."plan_activity"."plan_id" IS 'The plan this activity belongs to (references public.plans.id).';



COMMENT ON COLUMN "public"."plan_activity"."actor_id" IS 'The user who performed the activity (references public.users.id). Nullable for system-generated actions.';



COMMENT ON COLUMN "public"."plan_activity"."target_user_id" IS 'Optional target user affected by the activity (references public.users.id).';



COMMENT ON COLUMN "public"."plan_activity"."activity_type" IS 'Enum type of activity event.';



COMMENT ON COLUMN "public"."plan_activity"."metadata" IS 'JSONB payload for event-specific details (old/new title, capacity changes, etc.).';



COMMENT ON COLUMN "public"."plan_activity"."created_at" IS 'Immutable timestamp when the activity occurred.';



CREATE TABLE IF NOT EXISTS "public"."plan_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "invite_token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message_type" "public"."message_type" DEFAULT 'text'::"public"."message_type" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "system_message_type" "public"."system_message_type",
    CONSTRAINT "check_plan_message_content_not_empty" CHECK (("length"(TRIM(BOTH FROM "content")) > 0)),
    CONSTRAINT "check_system_message_type_invariant" CHECK (((("message_type" = 'system'::"public"."message_type") AND ("system_message_type" IS NOT NULL)) OR (("message_type" = ANY (ARRAY['text'::"public"."message_type", 'poll'::"public"."message_type", 'cost'::"public"."message_type"])) AND ("system_message_type" IS NULL))))
);


ALTER TABLE "public"."plan_messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."plan_messages" IS 'Stores chat messages for individual plans. Each plan acts as its own chat.';



COMMENT ON COLUMN "public"."plan_messages"."id" IS 'Primary key message UUID.';



COMMENT ON COLUMN "public"."plan_messages"."plan_id" IS 'The plan this message belongs to.';



COMMENT ON COLUMN "public"."plan_messages"."sender_id" IS 'The user who sent the message (references public.users.id).';



COMMENT ON COLUMN "public"."plan_messages"."message_type" IS 'Message payload type enum (text, system, poll). Defaults to text.';



COMMENT ON COLUMN "public"."plan_messages"."content" IS 'The textual content or payload of the message.';



COMMENT ON COLUMN "public"."plan_messages"."created_at" IS 'Timestamp when the message was created.';



COMMENT ON COLUMN "public"."plan_messages"."updated_at" IS 'Timestamp when the message was last edited.';



COMMENT ON COLUMN "public"."plan_messages"."system_message_type" IS 'Specific system event type when message_type = ''system''. NULL for text and poll messages.';



CREATE TABLE IF NOT EXISTS "public"."plan_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "submitted_by_user_id" "uuid" NOT NULL,
    "outcome_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_participants" (
    "plan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."participant_role" DEFAULT 'PARTICIPANT'::"public"."participant_role" NOT NULL,
    "rsvp_status" "public"."rsvp_status" DEFAULT 'INVITED'::"public"."rsvp_status" NOT NULL,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_status" character varying DEFAULT 'DELIVERED'::character varying NOT NULL,
    "skip_reason" "public"."skip_reason",
    "cost_per_participant" numeric(10,2),
    "circle_id" "uuid",
    "joined_queue_at" timestamp with time zone DEFAULT "now"(),
    "assigned_group" "public"."assigned_group_enum",
    "waitlist_position" integer,
    "leave_requested" boolean DEFAULT false NOT NULL,
    "leave_requested_at" timestamp with time zone,
    "final_attendance" "public"."attendance_status",
    "final_state" "public"."rsvp_status",
    CONSTRAINT "check_final_state_attendance" CHECK (((("final_attendance" IS NULL) AND ("final_state" IS NULL)) OR (("final_attendance" = 'ATTENDED'::"public"."attendance_status") AND ("final_state" = 'JOINED'::"public"."rsvp_status")) OR (("final_attendance" = 'DID_NOT_ATTEND'::"public"."attendance_status") AND ("final_state" = 'SKIPPED'::"public"."rsvp_status")))),
    CONSTRAINT "check_skip_reason_validity" CHECK ((("rsvp_status" = 'SKIPPED'::"public"."rsvp_status") OR ("skip_reason" IS NULL))),
    CONSTRAINT "plan_participants_delivery_status_check" CHECK ((("delivery_status")::"text" = 'DELIVERED'::"text"))
);


ALTER TABLE "public"."plan_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_team_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "team" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_team_assignments_team_check" CHECK (("team" = ANY (ARRAY['A'::"text", 'B'::"text", 'TEAM_1'::"text", 'TEAM_2'::"text"])))
);


ALTER TABLE "public"."plan_team_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "public_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "place_id" "text",
    "place_name" "text" NOT NULL,
    "place_address" "text" NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "rsvp_deadline" timestamp with time zone NOT NULL,
    "max_participants" integer,
    "status" "public"."plan_status" DEFAULT 'LIVE'::"public"."plan_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_image" "text",
    "discovery_item_id" "uuid",
    "category" "text" DEFAULT 'CUSTOM'::"text" NOT NULL,
    "subcategory" "text" DEFAULT 'OTHER'::"text" NOT NULL,
    "latitude" double precision,
    "longitude" double precision,
    "total_cost" numeric(10,2) DEFAULT 0 NOT NULL,
    "allow_participant_invites" boolean DEFAULT false NOT NULL,
    "participant_filtering" "public"."participant_filtering_type" DEFAULT 'AUTOMATIC'::"public"."participant_filtering_type" NOT NULL,
    "waitlist_order_mode" "public"."waitlist_order_mode_enum" DEFAULT 'AUTO'::"public"."waitlist_order_mode_enum" NOT NULL,
    "attended_participants" integer DEFAULT 0 NOT NULL,
    "plan_size" integer,
    CONSTRAINT "check_attended_participants_nonnegative" CHECK (("attended_participants" >= 0)),
    CONSTRAINT "check_max_participants" CHECK ((("max_participants" IS NULL) OR ("max_participants" > 0))),
    CONSTRAINT "check_plan_size_bounds" CHECK ((("plan_size" IS NULL) OR (("plan_size" >= 1) AND (("max_participants" IS NULL) OR ("plan_size" <= "max_participants"))))),
    CONSTRAINT "check_rsvp_deadline_before_scheduled" CHECK (("rsvp_deadline" <= "scheduled_at")),
    CONSTRAINT "check_title" CHECK (("length"(TRIM(BOTH FROM "title")) > 0)),
    CONSTRAINT "check_title_max_length" CHECK (("char_length"("title") <= 50))
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_public_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."user_public_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "public_id" "text" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "profile_photo_path" "text",
    "bio" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_completed" boolean DEFAULT false NOT NULL,
    "username" "text",
    "role" "public"."user_role" DEFAULT 'user'::"public"."user_role" NOT NULL,
    "friends" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "full_name_length_check" CHECK ((("full_name" IS NULL) OR ("char_length"("full_name") <= 40))),
    CONSTRAINT "username_length_check" CHECK ((("username" IS NULL) OR ("char_length"("username") <= 15)))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_expense_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount_owed" numeric(10,2) NOT NULL,
    "amount_paid" numeric(10,2) DEFAULT 0 NOT NULL,
    "status" "public"."participant_payment_status" DEFAULT 'PENDING'::"public"."participant_payment_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."wallet_expense_participants" REPLICA IDENTITY FULL;


ALTER TABLE "public"."wallet_expense_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "public"."wallet_expense_status" DEFAULT 'PENDING'::"public"."wallet_expense_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public_id" "text" NOT NULL,
    "message_id" "uuid",
    "title" "text" NOT NULL,
    "total_amount" numeric(10,2) NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "expense_type" "public"."wallet_expense_type" DEFAULT 'ADDITIONAL_EXPENSE'::"public"."wallet_expense_type"
);

ALTER TABLE ONLY "public"."wallet_expenses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."wallet_expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_settlement_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "expense_participant_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallet_settlement_allocations_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."wallet_settlement_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_settlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plan_id" "uuid",
    CONSTRAINT "check_payer_not_receiver" CHECK (("payer_id" <> "receiver_id")),
    CONSTRAINT "wallet_settlements_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."wallet_settlements" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."wallet_transaction_public_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."wallet_transaction_public_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wallet_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "status" "public"."transaction_status" DEFAULT 'COMPLETED'::"public"."transaction_status" NOT NULL,
    "public_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_wallet_transactions_amount_positive" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "chk_wallet_transactions_sender_receiver_different" CHECK (("sender_id" <> "receiver_id"))
);


ALTER TABLE "public"."wallet_transactions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."discovery_items"
    ADD CONSTRAINT "discovery_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discovery_items"
    ADD CONSTRAINT "discovery_items_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."discovery_sections"
    ADD CONSTRAINT "discovery_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discovery_sections"
    ADD CONSTRAINT "discovery_sections_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memories"
    ADD CONSTRAINT "memories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memory_results"
    ADD CONSTRAINT "memory_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_activity"
    ADD CONSTRAINT "plan_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_invites"
    ADD CONSTRAINT "plan_invites_invite_token_key" UNIQUE ("invite_token");



ALTER TABLE ONLY "public"."plan_invites"
    ADD CONSTRAINT "plan_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_messages"
    ADD CONSTRAINT "plan_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_outcomes"
    ADD CONSTRAINT "plan_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_participants"
    ADD CONSTRAINT "plan_participants_pkey" PRIMARY KEY ("plan_id", "user_id");



ALTER TABLE ONLY "public"."plan_team_assignments"
    ADD CONSTRAINT "plan_team_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "unique_friendship" UNIQUE ("user_1_id", "user_2_id");



ALTER TABLE ONLY "public"."memories"
    ADD CONSTRAINT "unique_memory_plan" UNIQUE ("plan_id");



ALTER TABLE ONLY "public"."memory_results"
    ADD CONSTRAINT "unique_memory_result" UNIQUE ("memory_id");



ALTER TABLE ONLY "public"."plan_outcomes"
    ADD CONSTRAINT "unique_plan_outcome" UNIQUE ("plan_id", "submitted_by_user_id", "outcome_type");



ALTER TABLE ONLY "public"."plan_team_assignments"
    ADD CONSTRAINT "unique_plan_user_team" UNIQUE ("plan_id", "user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."wallet_expense_participants"
    ADD CONSTRAINT "wallet_expense_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_expense_participants"
    ADD CONSTRAINT "wallet_expense_participants_unique_user" UNIQUE ("expense_id", "user_id");



ALTER TABLE ONLY "public"."wallet_expenses"
    ADD CONSTRAINT "wallet_expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_expenses"
    ADD CONSTRAINT "wallet_expenses_public_id_key" UNIQUE ("public_id");



ALTER TABLE ONLY "public"."wallet_settlement_allocations"
    ADD CONSTRAINT "wallet_settlement_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_settlements"
    ADD CONSTRAINT "wallet_settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_plan_activity_activity_type" ON "public"."plan_activity" USING "btree" ("activity_type");



CREATE INDEX "idx_plan_activity_created_at" ON "public"."plan_activity" USING "btree" ("created_at");



CREATE INDEX "idx_plan_activity_plan_created_at_desc" ON "public"."plan_activity" USING "btree" ("plan_id", "created_at" DESC);



CREATE INDEX "idx_plan_activity_plan_id" ON "public"."plan_activity" USING "btree" ("plan_id");



CREATE INDEX "idx_plan_messages_plan_created_at" ON "public"."plan_messages" USING "btree" ("plan_id", "created_at");



CREATE INDEX "idx_plan_messages_plan_id" ON "public"."plan_messages" USING "btree" ("plan_id");



CREATE INDEX "idx_plan_messages_sender_id" ON "public"."plan_messages" USING "btree" ("sender_id");



CREATE UNIQUE INDEX "idx_uniq_plan_waitlist_position" ON "public"."plan_participants" USING "btree" ("plan_id", "waitlist_position") WHERE (("assigned_group" = 'WAITLIST'::"public"."assigned_group_enum") AND ("waitlist_position" IS NOT NULL));



CREATE INDEX "idx_wallet_expense_participants_expense_id" ON "public"."wallet_expense_participants" USING "btree" ("expense_id");



CREATE INDEX "idx_wallet_expense_participants_user_id" ON "public"."wallet_expense_participants" USING "btree" ("user_id");



CREATE INDEX "idx_wallet_settlement_allocations_expense_participant_id" ON "public"."wallet_settlement_allocations" USING "btree" ("expense_participant_id");



CREATE INDEX "idx_wallet_settlement_allocations_settlement_id" ON "public"."wallet_settlement_allocations" USING "btree" ("settlement_id");



CREATE INDEX "idx_wallet_settlements_created_at" ON "public"."wallet_settlements" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_wallet_settlements_payer_receiver" ON "public"."wallet_settlements" USING "btree" ("payer_id", "receiver_id");



CREATE INDEX "idx_wallet_settlements_plan_id" ON "public"."wallet_settlements" USING "btree" ("plan_id");



CREATE INDEX "idx_wallet_transactions_expense_id" ON "public"."wallet_transactions" USING "btree" ("expense_id");



CREATE INDEX "idx_wallet_transactions_plan_id" ON "public"."wallet_transactions" USING "btree" ("plan_id");



CREATE INDEX "idx_wallet_transactions_receiver_id" ON "public"."wallet_transactions" USING "btree" ("receiver_id");



CREATE INDEX "idx_wallet_transactions_sender_id" ON "public"."wallet_transactions" USING "btree" ("sender_id");



CREATE INDEX "idx_wallet_transactions_status" ON "public"."wallet_transactions" USING "btree" ("status");



CREATE OR REPLACE TRIGGER "enforce_skip_reason_null_trigger" BEFORE INSERT OR UPDATE OF "rsvp_status", "skip_reason" ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_enforce_skip_reason_null"();



CREATE OR REPLACE TRIGGER "trg_auto_insert_plan_host_participant" AFTER INSERT ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_plan_creator_participant"();



CREATE OR REPLACE TRIGGER "trg_auto_promote_on_vacancy_trigger" AFTER UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_auto_promote_on_vacancy"();



CREATE OR REPLACE TRIGGER "trg_block_manual_queue_move_on_automatic_trigger" BEFORE UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_block_manual_queue_move_on_automatic"();



CREATE OR REPLACE TRIGGER "trg_enforce_waitlist_position_invariant_trigger" BEFORE INSERT OR UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_enforce_waitlist_position_invariant"();



CREATE OR REPLACE TRIGGER "trg_log_plan_lifecycle_activity" AFTER INSERT OR UPDATE ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."log_plan_lifecycle_activity"();



CREATE OR REPLACE TRIGGER "trg_log_plan_participant_activity" AFTER UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."log_plan_participant_activity"();



CREATE OR REPLACE TRIGGER "trg_maintain_joined_queue_at_trigger" BEFORE INSERT OR UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_maintain_joined_queue_at"();



CREATE OR REPLACE TRIGGER "trg_plans_public_id" BEFORE INSERT ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."generate_plan_public_id"();



CREATE OR REPLACE TRIGGER "trg_preserve_payment_kept_skip_reason_trigger" BEFORE UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_preserve_payment_kept_skip_reason"();



CREATE OR REPLACE TRIGGER "trg_reset_waitlisted_or_skipped_host_role_trigger" BEFORE INSERT OR UPDATE ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"();



CREATE OR REPLACE TRIGGER "trg_update_user_friends_count" AFTER INSERT OR DELETE OR UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_friends_count"();



CREATE OR REPLACE TRIGGER "trg_wallet_expense_participants_updated_at" BEFORE UPDATE ON "public"."wallet_expense_participants" FOR EACH ROW EXECUTE FUNCTION "public"."set_wallet_expense_participants_updated_at"();



CREATE OR REPLACE TRIGGER "trg_wallet_expenses_public_id" BEFORE INSERT ON "public"."wallet_expenses" FOR EACH ROW EXECUTE FUNCTION "public"."generate_wallet_expense_public_id"();



CREATE OR REPLACE TRIGGER "trg_wallet_transactions_public_id" BEFORE INSERT ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."generate_wallet_transaction_public_id"();



CREATE OR REPLACE TRIGGER "trg_wallet_transactions_updated_at" BEFORE UPDATE ON "public"."wallet_transactions" FOR EACH ROW EXECUTE FUNCTION "public"."set_wallet_transactions_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_enforce_plan_participants_completion_lifecycle" AFTER INSERT OR UPDATE OF "status" ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_plan_participants_completion_lifecycle"();



CREATE OR REPLACE TRIGGER "trigger_set_participant_cost_share_on_join" BEFORE INSERT OR UPDATE OF "rsvp_status" ON "public"."plan_participants" FOR EACH ROW EXECUTE FUNCTION "public"."set_participant_cost_share_on_join"();



CREATE OR REPLACE TRIGGER "trigger_sync_plan_participant_cost_share" AFTER UPDATE OF "total_cost", "max_participants" ON "public"."plans" FOR EACH ROW EXECUTE FUNCTION "public"."sync_plan_participant_cost_share"();



ALTER TABLE ONLY "public"."discovery_items"
    ADD CONSTRAINT "discovery_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."discovery_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_created_from_plan_id_fkey" FOREIGN KEY ("created_from_plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_1_id_fkey" FOREIGN KEY ("user_1_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_2_id_fkey" FOREIGN KEY ("user_2_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memories"
    ADD CONSTRAINT "memories_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_results"
    ADD CONSTRAINT "memory_results_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memory_results"
    ADD CONSTRAINT "memory_results_mvp_user_id_fkey" FOREIGN KEY ("mvp_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_related_plan_id_fkey" FOREIGN KEY ("related_plan_id") REFERENCES "public"."plans"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_activity"
    ADD CONSTRAINT "plan_activity_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_activity"
    ADD CONSTRAINT "plan_activity_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_activity"
    ADD CONSTRAINT "plan_activity_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."plan_invites"
    ADD CONSTRAINT "plan_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_invites"
    ADD CONSTRAINT "plan_invites_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_messages"
    ADD CONSTRAINT "plan_messages_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_messages"
    ADD CONSTRAINT "plan_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_outcomes"
    ADD CONSTRAINT "plan_outcomes_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_outcomes"
    ADD CONSTRAINT "plan_outcomes_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_participants"
    ADD CONSTRAINT "plan_participants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_participants"
    ADD CONSTRAINT "plan_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_team_assignments"
    ADD CONSTRAINT "plan_team_assignments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_team_assignments"
    ADD CONSTRAINT "plan_team_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "plans_discovery_item_id_fkey" FOREIGN KEY ("discovery_item_id") REFERENCES "public"."discovery_items"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_expense_participants"
    ADD CONSTRAINT "wallet_expense_participants_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."wallet_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_expense_participants"
    ADD CONSTRAINT "wallet_expense_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_expenses"
    ADD CONSTRAINT "wallet_expenses_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."plan_messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wallet_expenses"
    ADD CONSTRAINT "wallet_expenses_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_expenses"
    ADD CONSTRAINT "wallet_expenses_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settlement_allocations"
    ADD CONSTRAINT "wallet_settlement_allocations_expense_participant_id_fkey" FOREIGN KEY ("expense_participant_id") REFERENCES "public"."wallet_expense_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settlement_allocations"
    ADD CONSTRAINT "wallet_settlement_allocations_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."wallet_settlements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settlements"
    ADD CONSTRAINT "wallet_settlements_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settlements"
    ADD CONSTRAINT "wallet_settlements_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_settlements"
    ADD CONSTRAINT "wallet_settlements_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."wallet_expenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wallet_transactions"
    ADD CONSTRAINT "wallet_transactions_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete discovery items" ON "public"."discovery_items" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can delete discovery sections" ON "public"."discovery_sections" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can insert discovery items" ON "public"."discovery_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can insert discovery sections" ON "public"."discovery_sections" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can update discovery items" ON "public"."discovery_items" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Admins can update discovery sections" ON "public"."discovery_sections" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));



CREATE POLICY "Allow authenticated users to delete friendships" ON "public"."friendships" FOR DELETE TO "authenticated" USING ((("auth"."uid"() = "user_1_id") OR ("auth"."uid"() = "user_2_id")));



CREATE POLICY "Allow authenticated users to delete team assignments" ON "public"."plan_team_assignments" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to insert friendships" ON "public"."friendships" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_1_id") OR ("auth"."uid"() = "user_2_id")));



CREATE POLICY "Allow authenticated users to insert memory results" ON "public"."memory_results" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert plan outcomes" ON "public"."plan_outcomes" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to insert plan_activity" ON "public"."plan_activity" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_activity"."plan_id") AND ("pp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow authenticated users to insert team assignments" ON "public"."plan_team_assignments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Allow authenticated users to read all profiles" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to update friendships" ON "public"."friendships" FOR UPDATE TO "authenticated" USING ((("auth"."uid"() = "user_1_id") OR ("auth"."uid"() = "user_2_id"))) WITH CHECK ((("auth"."uid"() = "user_1_id") OR ("auth"."uid"() = "user_2_id")));



CREATE POLICY "Allow authenticated users to update memory results" ON "public"."memory_results" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update plan outcomes" ON "public"."plan_outcomes" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to update team assignments" ON "public"."plan_team_assignments" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Allow authenticated users to view friendships" ON "public"."friendships" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "user_1_id") OR ("auth"."uid"() = "user_2_id")));



CREATE POLICY "Allow authenticated users to view memory results" ON "public"."memory_results" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view plan invites" ON "public"."plan_invites" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view plan outcomes" ON "public"."plan_outcomes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow authenticated users to view team assignments" ON "public"."plan_team_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow hosts to insert plan invites" ON "public"."plan_invites" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_invites"."plan_id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role") AND ("pp"."rsvp_status" = 'JOINED'::"public"."rsvp_status"))))));



CREATE POLICY "Allow hosts to update plan invites" ON "public"."plan_invites" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_invites"."plan_id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role") AND ("pp"."rsvp_status" = 'JOINED'::"public"."rsvp_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_invites"."plan_id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role") AND ("pp"."rsvp_status" = 'JOINED'::"public"."rsvp_status")))));



CREATE POLICY "Allow hosts to update plans" ON "public"."plans" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plans"."id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role") AND ("pp"."rsvp_status" = 'JOINED'::"public"."rsvp_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plans"."id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role") AND ("pp"."rsvp_status" = 'JOINED'::"public"."rsvp_status")))));



CREATE POLICY "Allow plan participants to insert messages" ON "public"."plan_messages" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."plan_participants"
  WHERE (("plan_participants"."plan_id" = "plan_messages"."plan_id") AND ("plan_participants"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Allow plan participants to select messages" ON "public"."plan_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plan_participants"
  WHERE (("plan_participants"."plan_id" = "plan_messages"."plan_id") AND ("plan_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow plan participants to select plan_activity" ON "public"."plan_activity" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."plan_participants"
  WHERE (("plan_participants"."plan_id" = "plan_activity"."plan_id") AND ("plan_participants"."user_id" = "auth"."uid"())))));



CREATE POLICY "Allow public read access on discovery_items" ON "public"."discovery_items" FOR SELECT USING (true);



CREATE POLICY "Allow public read access on discovery_sections" ON "public"."discovery_sections" FOR SELECT USING (true);



CREATE POLICY "Authenticated users can insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Deny all deletes on plan messages" ON "public"."plan_messages" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Deny all updates on plan messages" ON "public"."plan_messages" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Deny delete on plan_activity for authenticated users" ON "public"."plan_activity" FOR DELETE TO "authenticated" USING (false);



CREATE POLICY "Deny update on plan_activity for authenticated users" ON "public"."plan_activity" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Hosts and users can delete plan participants" ON "public"."plan_participants" FOR DELETE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_participants"."plan_id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role"))))));



CREATE POLICY "Hosts and users can update plan participants" ON "public"."plan_participants" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."plan_participants" "pp"
  WHERE (("pp"."plan_id" = "plan_participants"."plan_id") AND ("pp"."user_id" = "auth"."uid"()) AND ("pp"."role" = 'HOST'::"public"."participant_role"))))));



CREATE POLICY "Parties can delete settlements" ON "public"."wallet_settlements" FOR DELETE USING ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Payer can insert settlements" ON "public"."wallet_settlements" FOR INSERT WITH CHECK (("auth"."uid"() = "payer_id"));



CREATE POLICY "Users can create their own profile" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can insert plan participants" ON "public"."plan_participants" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can insert plans" ON "public"."plans" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Users can update their own notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can view accepted friends profiles" ON "public"."users" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."friendships" "f"
  WHERE (("f"."status" = 'ACCEPTED'::"public"."friendship_status") AND ((("f"."user_1_id" = "auth"."uid"()) AND ("f"."user_2_id" = "users"."id")) OR (("f"."user_2_id" = "auth"."uid"()) AND ("f"."user_1_id" = "users"."id")))))));



CREATE POLICY "Users can view allocations they are part of" ON "public"."wallet_settlement_allocations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."wallet_settlements" "s"
  WHERE (("s"."id" = "wallet_settlement_allocations"."settlement_id") AND (("s"."payer_id" = "auth"."uid"()) OR ("s"."receiver_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view plan participants" ON "public"."plan_participants" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view plans" ON "public"."plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can view settlements they are part of" ON "public"."wallet_settlements" FOR SELECT USING ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "receiver_id")));



CREATE POLICY "Users can view their own notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."discovery_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discovery_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."memory_results" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_team_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_plans" ON "public"."plans" FOR SELECT USING (true);



CREATE POLICY "select_users" ON "public"."users" FOR SELECT USING (true);



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_expense_participants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_expense_participants_delete" ON "public"."wallet_expense_participants" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND ("we"."payer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND "public"."is_plan_host"("we"."plan_id", "auth"."uid"()))))));



CREATE POLICY "wallet_expense_participants_insert" ON "public"."wallet_expense_participants" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND ("we"."payer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND "public"."is_plan_host"("we"."plan_id", "auth"."uid"()))))));



CREATE POLICY "wallet_expense_participants_select" ON "public"."wallet_expense_participants" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_expense_participant"("expense_id", "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND ("we"."payer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND "public"."is_plan_host"("we"."plan_id", "auth"."uid"()))))));



CREATE POLICY "wallet_expense_participants_update" ON "public"."wallet_expense_participants" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND ("we"."payer_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."wallet_expenses" "we"
  WHERE (("we"."id" = "wallet_expense_participants"."expense_id") AND "public"."is_plan_host"("we"."plan_id", "auth"."uid"()))))));



ALTER TABLE "public"."wallet_expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_expenses_delete" ON "public"."wallet_expenses" FOR DELETE TO "authenticated" USING ((("payer_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));



CREATE POLICY "wallet_expenses_insert" ON "public"."wallet_expenses" FOR INSERT TO "authenticated" WITH CHECK ((("payer_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."plan_participants"
  WHERE (("plan_participants"."plan_id" = "wallet_expenses"."plan_id") AND ("plan_participants"."user_id" = "auth"."uid"()))))));



CREATE POLICY "wallet_expenses_select" ON "public"."wallet_expenses" FOR SELECT TO "authenticated" USING ((("payer_id" = "auth"."uid"()) OR "public"."is_wallet_expense_participant"("id", "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));



CREATE POLICY "wallet_expenses_update" ON "public"."wallet_expenses" FOR UPDATE TO "authenticated" USING ((("payer_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"()))) WITH CHECK ((("payer_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));



ALTER TABLE "public"."wallet_settlement_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_settlements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."wallet_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wallet_transactions_delete" ON "public"."wallet_transactions" FOR DELETE TO "authenticated" USING ((("receiver_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));



CREATE POLICY "wallet_transactions_insert" ON "public"."wallet_transactions" FOR INSERT TO "authenticated" WITH CHECK (((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())) AND (EXISTS ( SELECT 1
   FROM "public"."plan_participants"
  WHERE (("plan_participants"."plan_id" = "wallet_transactions"."plan_id") AND ("plan_participants"."user_id" = "auth"."uid"()))))));



CREATE POLICY "wallet_transactions_select" ON "public"."wallet_transactions" FOR SELECT TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));



CREATE POLICY "wallet_transactions_update" ON "public"."wallet_transactions" FOR UPDATE TO "authenticated" USING ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"()))) WITH CHECK ((("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"()) OR "public"."is_plan_host"("plan_id", "auth"."uid"())));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."memories";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."memory_results";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."plan_activity";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."plan_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."plan_outcomes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."plan_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."plans";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."users";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_expense_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_expenses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_settlement_allocations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."wallet_settlements";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


























































































































































































GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_assigned"("p_plan_id" "uuid", "p_vacated_group" "public"."assigned_group_enum") TO "anon";
GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_assigned"("p_plan_id" "uuid", "p_vacated_group" "public"."assigned_group_enum") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_assigned"("p_plan_id" "uuid", "p_vacated_group" "public"."assigned_group_enum") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_automatic"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_automatic"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_promote_waitlist_for_automatic"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_paid_plan_leave_request"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_paid_plan_leave_request"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_paid_plan_leave_request"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_plan"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_circle_host_invariant"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_circle_host_invariant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_circle_host_invariant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb", "p_expense_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb", "p_expense_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_plan"("p_plan_id" "uuid", "p_attendance_input" "jsonb", "p_expense_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_wallet_settlement"("p_other_user_id" "uuid", "p_amount" numeric, "p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_wallet_settlement"("p_other_user_id" "uuid", "p_amount" numeric, "p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_wallet_settlement"("p_other_user_id" "uuid", "p_amount" numeric, "p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_wallet_expense"("p_expense_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_wallet_expense"("p_expense_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_wallet_expense"("p_expense_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_wallet_settlement"("p_settlement_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_wallet_settlement"("p_settlement_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_wallet_settlement"("p_settlement_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."demote_from_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."demote_from_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."demote_from_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_plan_participants_completion_lifecycle"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_plan_participants_completion_lifecycle"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_plan_participants_completion_lifecycle"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_circle_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_circle_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_circle_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_discovery_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_discovery_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_discovery_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_plan_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_plan_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_plan_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_user_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_user_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_user_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_wallet_expense_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_wallet_expense_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_wallet_expense_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_wallet_transaction_public_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_wallet_transaction_public_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_wallet_transaction_public_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_plan_participant_filtering"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_plan_participant_filtering"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_plan_participant_filtering"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_plan_creator_participant"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_plan_creator_participant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_plan_creator_participant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_cost_expense"("p_plan_id" "uuid", "p_message_id" "uuid", "p_payer_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_participant_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."insert_cost_expense"("p_plan_id" "uuid", "p_message_id" "uuid", "p_payer_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_participant_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_cost_expense"("p_plan_id" "uuid", "p_message_id" "uuid", "p_payer_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_participant_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_participants"("p_plan_id" "uuid", "p_invitee_user_ids" "uuid"[], "p_assigned_group" "public"."assigned_group_enum") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_participants"("p_plan_id" "uuid", "p_invitee_user_ids" "uuid"[], "p_assigned_group" "public"."assigned_group_enum") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_participants"("p_plan_id" "uuid", "p_invitee_user_ids" "uuid"[], "p_assigned_group" "public"."assigned_group_enum") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_plan_host"("p_plan_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_plan_host"("p_plan_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_plan_host"("p_plan_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_plan_image_host"("object_name" "text", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_plan_image_host"("object_name" "text", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_plan_image_host"("object_name" "text", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_wallet_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_wallet_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_wallet_expense_participant"("p_expense_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_plan"("p_plan_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_plan_lifecycle_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_plan_lifecycle_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_plan_lifecycle_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_plan_participant_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_plan_participant_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_plan_participant_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[], "p_expense_mode" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[], "p_expense_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."manage_completed_plan_participants"("p_plan_id" "uuid", "p_users_to_add" "uuid"[], "p_users_to_remove" "uuid"[], "p_expense_mode" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_participant_to_waitlist_and_decrease_capacity"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."move_participant_to_waitlist_and_decrease_capacity"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_participant_to_waitlist_and_decrease_capacity"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_waitlist_to_going"("p_plan_id" "uuid", "p_target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_waitlist_to_going"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_waitlist_to_going"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_to_host"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rebuild_waitlist_queue"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rebuild_waitlist_queue"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rebuild_waitlist_queue"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_wallet_expenses"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_wallet_expenses"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_wallet_expenses"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rejoin_plan"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."rejoin_plan"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."rejoin_plan"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_and_replace_participant"("p_plan_id" "uuid", "p_remove_user_id" "uuid", "p_promote_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_and_replace_participant"("p_plan_id" "uuid", "p_remove_user_id" "uuid", "p_promote_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_and_replace_participant"("p_plan_id" "uuid", "p_remove_user_id" "uuid", "p_promote_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid", "p_strategy" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid", "p_strategy" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_expense_participant_and_redistribute"("p_expense_id" "uuid", "p_participant_user_id" "uuid", "p_strategy" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reorder_waitlist"("p_plan_id" "uuid", "p_ordered_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."reorder_waitlist"("p_plan_id" "uuid", "p_ordered_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_waitlist"("p_plan_id" "uuid", "p_ordered_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_replacement_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_replacement_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_replacement_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_host_leave_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_paid_plan_leave"("p_plan_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_paid_plan_leave_request"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_resolution" "text", "p_replacement_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_rejoined_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_decision" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_rejoined_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_decision" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_rejoined_participant"("p_plan_id" "uuid", "p_target_user_id" "uuid", "p_decision" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_participant_cost_share_on_join"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_participant_cost_share_on_join"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_participant_cost_share_on_join"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_wallet_expense_participants_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_wallet_expense_participants_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_wallet_expense_participants_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_wallet_transactions_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_wallet_transactions_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_wallet_transactions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_wallet_expense"("p_expense_id" "uuid", "p_debtor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_wallet_expense"("p_expense_id" "uuid", "p_debtor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_wallet_expense"("p_expense_id" "uuid", "p_debtor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."settle_wallet_relationship"("p_debtor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."settle_wallet_relationship"("p_debtor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."settle_wallet_relationship"("p_debtor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."stop_hosting_with_replacement"("p_plan_id" "uuid", "p_replacement_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."swap_plan_participants"("p_plan_id" "uuid", "p_going_user_id" "uuid", "p_waitlist_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."swap_plan_participants"("p_plan_id" "uuid", "p_going_user_id" "uuid", "p_waitlist_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."swap_plan_participants"("p_plan_id" "uuid", "p_going_user_id" "uuid", "p_waitlist_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."switch_to_automatic_waitlist_mode"("p_plan_id" "uuid", "p_promoted_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."switch_to_automatic_waitlist_mode"("p_plan_id" "uuid", "p_promoted_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."switch_to_automatic_waitlist_mode"("p_plan_id" "uuid", "p_promoted_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_plan_participant_cost_share"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_plan_participant_cost_share"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_plan_participant_cost_share"() TO "service_role";



GRANT ALL ON FUNCTION "public"."transfer_circle_ownership"("p_circle_id" "uuid", "p_old_host_id" "uuid", "p_new_host_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_circle_ownership"("p_circle_id" "uuid", "p_old_host_id" "uuid", "p_new_host_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_circle_ownership"("p_circle_id" "uuid", "p_old_host_id" "uuid", "p_new_host_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_auto_promote_on_vacancy"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_auto_promote_on_vacancy"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_auto_promote_on_vacancy"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_block_manual_queue_move_on_automatic"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_block_manual_queue_move_on_automatic"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_block_manual_queue_move_on_automatic"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_enforce_waitlist_position_invariant"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_enforce_waitlist_position_invariant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_enforce_waitlist_position_invariant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_maintain_joined_queue_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_maintain_joined_queue_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_maintain_joined_queue_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_preserve_payment_kept_skip_reason"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_preserve_payment_kept_skip_reason"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_preserve_payment_kept_skip_reason"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_reset_waitlisted_or_skipped_host_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_enforce_skip_reason_null"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_enforce_skip_reason_null"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_enforce_skip_reason_null"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_cost_expense"("p_expense_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_plan_id" "uuid", "p_participant_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_cost_expense"("p_expense_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_plan_id" "uuid", "p_participant_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_cost_expense"("p_expense_id" "uuid", "p_title" "text", "p_total_amount" numeric, "p_plan_id" "uuid", "p_participant_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_plan_capacity"("p_plan_id" "uuid", "p_max_participants" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_plan_capacity"("p_plan_id" "uuid", "p_max_participants" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_plan_capacity"("p_plan_id" "uuid", "p_max_participants" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_friends_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_friends_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_friends_count"() TO "service_role";
























GRANT ALL ON TABLE "public"."discovery_items" TO "anon";
GRANT ALL ON TABLE "public"."discovery_items" TO "authenticated";
GRANT ALL ON TABLE "public"."discovery_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."discovery_public_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."discovery_public_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."discovery_public_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."discovery_sections" TO "anon";
GRANT ALL ON TABLE "public"."discovery_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."discovery_sections" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."memories" TO "anon";
GRANT ALL ON TABLE "public"."memories" TO "authenticated";
GRANT ALL ON TABLE "public"."memories" TO "service_role";



GRANT ALL ON TABLE "public"."memory_results" TO "anon";
GRANT ALL ON TABLE "public"."memory_results" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_results" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."plan_activity" TO "anon";
GRANT ALL ON TABLE "public"."plan_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_activity" TO "service_role";



GRANT ALL ON TABLE "public"."plan_invites" TO "anon";
GRANT ALL ON TABLE "public"."plan_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_invites" TO "service_role";



GRANT ALL ON TABLE "public"."plan_messages" TO "anon";
GRANT ALL ON TABLE "public"."plan_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_messages" TO "service_role";



GRANT ALL ON TABLE "public"."plan_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."plan_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."plan_participants" TO "anon";
GRANT ALL ON TABLE "public"."plan_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_participants" TO "service_role";



GRANT ALL ON TABLE "public"."plan_team_assignments" TO "anon";
GRANT ALL ON TABLE "public"."plan_team_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."plan_team_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_public_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_public_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_public_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_expense_participants" TO "anon";
GRANT ALL ON TABLE "public"."wallet_expense_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_expense_participants" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_expenses" TO "anon";
GRANT ALL ON TABLE "public"."wallet_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_expenses" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_settlement_allocations" TO "anon";
GRANT ALL ON TABLE "public"."wallet_settlement_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_settlement_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_settlements" TO "anon";
GRANT ALL ON TABLE "public"."wallet_settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_settlements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."wallet_transaction_public_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."wallet_transaction_public_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."wallet_transaction_public_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."wallet_transactions" TO "anon";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."wallet_transactions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";

































-- =============================================================================
-- Storage Buckets & Policies
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, false, null, null),
  ('discovery-images', 'discovery-images', true, false, null, null),
  ('plan-images', 'plan-images', true, false, 10485760, ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/jpg'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies for plan-images
DROP POLICY IF EXISTS "Public read plan images" ON storage.objects;
CREATE POLICY "Public read plan images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'plan-images');

DROP POLICY IF EXISTS "Active hosts can upload plan images" ON storage.objects;
CREATE POLICY "Active hosts can upload plan images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'plan-images' AND public.is_plan_image_host(name, auth.uid()));

DROP POLICY IF EXISTS "Active hosts can update plan images" ON storage.objects;
CREATE POLICY "Active hosts can update plan images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'plan-images' AND public.is_plan_image_host(name, auth.uid()))
  WITH CHECK (bucket_id = 'plan-images' AND public.is_plan_image_host(name, auth.uid()));

DROP POLICY IF EXISTS "Active hosts can delete plan images" ON storage.objects;
CREATE POLICY "Active hosts can delete plan images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'plan-images' AND public.is_plan_image_host(name, auth.uid()));

-- Storage Policies for discovery-images
DROP POLICY IF EXISTS "Public read discovery images" ON storage.objects;
CREATE POLICY "Public read discovery images" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'discovery-images');

DROP POLICY IF EXISTS "Admins can upload discovery images" ON storage.objects;
CREATE POLICY "Admins can upload discovery images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'discovery-images' AND EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.role = 'admin'::public.user_role));

DROP POLICY IF EXISTS "Admins can update discovery images" ON storage.objects;
CREATE POLICY "Admins can update discovery images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'discovery-images' AND EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.role = 'admin'::public.user_role))
  WITH CHECK (bucket_id = 'discovery-images' AND EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.role = 'admin'::public.user_role));

DROP POLICY IF EXISTS "Admins can delete discovery images" ON storage.objects;
CREATE POLICY "Admins can delete discovery images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'discovery-images' AND EXISTS (SELECT 1 FROM public.users WHERE public.users.id = auth.uid() AND public.users.role = 'admin'::public.user_role));

-- Storage Policies for avatars
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
