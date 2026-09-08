-- Migration: 20260907150000_seed_all_plan_activity_test_data.sql
-- Description: Deterministically seed comprehensive test activity data for plan fa938dd6-1e12-4901-a55a-062d2d206523
-- covering all 14 enum values of public.plan_activity_type and distinct visual card states.

DO $$
DECLARE
  v_plan_id UUID := 'fa938dd6-1e12-4901-a55a-062d2d206523';
  v_host_id UUID := '06064726-079a-438f-919f-a8be1da70831';      -- Renjith (Host)
  v_user_thilaka UUID := 'c3dc4291-f7d7-4cf5-88f3-6be5cdb71353';  -- Thilaka Sundar (Participant)
  v_user_pranav UUID := 'c7ce6e17-5b1b-4a32-8f32-c97278788143';   -- Pranav (Participant)
  v_user_raam UUID := '1d1aed6a-d5e3-4263-b8b7-94f27982387f';     -- RAAM (Participant)
  v_user_thi UUID := 'e2b16e5c-d129-4e16-bc03-38894eacedd4';      -- Thi (Participant)
  v_user_thilak UUID := 'a4d39449-ec09-4e34-98be-d0d175e6085d';   -- Thilak (Participant)
  v_user_jeppu UUID := '6778a432-5cf7-41b2-a2ca-9db52dce8abd';    -- Jeppu (Participant)
  v_user_aznan UUID := '723cddf6-e1fb-4053-a12c-e330186a0369';    -- Aznan (Participant)
BEGIN
  -- 1. Idempotency: Remove previous test records matching test_seed marker
  DELETE FROM public.plan_activity
  WHERE plan_id = v_plan_id
    AND metadata->>'test_seed' = 'all_activity_types';

  -- 2. Insert test activities covering all enum types and UI variants

  -- [1/19] plan_created
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_host_id,
    'plan_created'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types', 'title', 'Lunch'),
    '2026-09-07 07:25:00+00'
  );

  -- [2/19] plan_location_changed
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'plan_location_changed'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'new_location', 'Nandhana Palace - Andhra Style Restaurant',
      'place_address', 'Rajajinagar, Bengaluru, Karnataka'
    ),
    '2026-09-07 07:27:00+00'
  );

  -- [3/19] plan_datetime_changed
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'plan_datetime_changed'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'old_scheduled_at', '2026-09-10T08:00:00.000Z',
      'new_scheduled_at', '2026-09-12T13:30:00.000Z'
    ),
    '2026-09-07 07:29:00+00'
  );

  -- [4/19] participant_joined
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_user_thilaka,
    v_user_thilaka,
    'participant_joined'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 07:31:00+00'
  );

  -- [5/19] participant_waitlisted
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_user_pranav,
    v_user_pranav,
    'participant_waitlisted'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 07:33:00+00'
  );

  -- [6/19] participant_moved_to_joined
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_raam,
    'participant_moved_to_joined'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'from', 'waitlist',
      'to', 'joined'
    ),
    '2026-09-07 07:35:00+00'
  );

  -- [7/19] participant_moved_to_waitlist
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_thi,
    'participant_moved_to_waitlist'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'from', 'joined',
      'to', 'waitlist'
    ),
    '2026-09-07 07:37:00+00'
  );

  -- [8/19] participant_removed
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_jeppu,
    'participant_removed'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'skip_reason', 'REMOVED'
    ),
    '2026-09-07 07:39:00+00'
  );

  -- [9/19] participant_skipped (Invitation Declined)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_user_aznan,
    v_user_aznan,
    'participant_skipped'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 07:41:00+00'
  );

  -- [10/19] host_promoted
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_thilaka,
    'host_promoted'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 07:43:00+00'
  );

  -- [11/19] participant_left (Standard leave)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_user_thilak,
    v_user_thilak,
    'participant_left'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 07:45:00+00'
  );

  -- [12/19] participant_left (Resolved: KEEP_PAYMENT)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_raam,
    'participant_left'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'status', 'RESOLVED',
      'resolution', 'KEEP_PAYMENT'
    ),
    '2026-09-07 07:47:00+00'
  );

  -- [13/19] participant_left (Resolved: REPLACED)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_thi,
    'participant_left'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'status', 'RESOLVED',
      'resolution', 'REPLACED',
      'replacement_user_id', v_user_pranav
    ),
    '2026-09-07 07:49:00+00'
  );

  -- [14/19] participants_swapped (Going ⇄ Waitlist)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_pranav,
    'participants_swapped'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'going_user_id', v_user_pranav,
      'going_user_name', 'Pranav',
      'waitlist_user_id', v_user_raam,
      'waitlist_user_name', 'RAAM',
      'waitlist_result', 'waitlist',
      'performed_by', v_host_id,
      'performed_by_name', 'Renjith'
    ),
    '2026-09-07 07:51:00+00'
  );

  -- [15/19] participants_swapped (Going ⇄ Removed / Replace)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    v_user_thilaka,
    'participants_swapped'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'going_user_id', v_user_thilaka,
      'going_user_name', 'Thilaka Sundar',
      'waitlist_user_id', v_user_jeppu,
      'waitlist_user_name', 'Jeppu',
      'waitlist_result', 'removed',
      'performed_by', v_host_id,
      'performed_by_name', 'Renjith'
    ),
    '2026-09-07 07:53:00+00'
  );

  -- [16/19] participant_invites_toggled (Enabled)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'participant_invites_toggled'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'enabled', true,
      'performed_by', v_host_id,
      'performed_by_name', 'Renjith'
    ),
    '2026-09-07 07:55:00+00'
  );

  -- [17/19] plan_changed (Capacity Change: 6 → 10 participants)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'plan_changed'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'change_type', 'capacity_changed',
      'old_capacity', 6,
      'new_capacity', 10
    ),
    '2026-09-07 07:57:00+00'
  );

  -- [18/19] plan_changed (Title Change)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'plan_changed'::public.plan_activity_type,
    jsonb_build_object(
      'test_seed', 'all_activity_types',
      'change_type', 'title_changed',
      'old_title', 'Lunch',
      'new_title', 'Weekend Gourmet Lunch'
    ),
    '2026-09-07 07:59:00+00'
  );

  -- [19/19] plan_changed (Generic Plan Activity Updated)
  INSERT INTO public.plan_activity (plan_id, actor_id, target_user_id, activity_type, metadata, created_at)
  VALUES (
    v_plan_id,
    v_host_id,
    NULL,
    'plan_changed'::public.plan_activity_type,
    jsonb_build_object('test_seed', 'all_activity_types'),
    '2026-09-07 08:01:00+00'
  );

END $$;
