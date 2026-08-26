-- Migration: Add completion attendance fields to plan_participants
-- Description: Phase 1 of plan completion - adds final_attendance and final_state columns to track attendance for completed plans.

CREATE TYPE public.attendance_status AS ENUM (
  'ATTENDED',
  'DID_NOT_ATTEND'
);

ALTER TABLE public.plan_participants
  ADD COLUMN final_attendance public.attendance_status,
  ADD COLUMN final_state public.rsvp_status;

-- Ensure that final state matches the rules:
-- NULL -> NULL
-- ATTENDED -> JOINED
-- DID_NOT_ATTEND -> SKIPPED
ALTER TABLE public.plan_participants
  ADD CONSTRAINT check_final_state_attendance 
  CHECK (
    (final_attendance IS NULL AND final_state IS NULL) OR
    (final_attendance = 'ATTENDED' AND final_state = 'JOINED') OR
    (final_attendance = 'DID_NOT_ATTEND' AND final_state = 'SKIPPED')
  );
