-- Migration: 025_update_rsvp_status_enum
-- Description: Finalize RSVP lifecycle enums to INVITED, JOINED, SKIPPED, WAITLISTED.
--              Add delivery_status column to public.plan_participants for Home Feed visibility states.

-- 1. Add delivery_status column if it does not exist
ALTER TABLE public.plan_participants 
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR NOT NULL DEFAULT 'DELIVERED' 
CONSTRAINT check_delivery_status CHECK (delivery_status = 'DELIVERED');

-- 2. Rename old rsvp_status type
ALTER TYPE public.rsvp_status RENAME TO rsvp_status_old;

-- 3. Create new rsvp_status enum type
CREATE TYPE public.rsvp_status AS ENUM ('INVITED', 'JOINED', 'SKIPPED', 'WAITLISTED');

-- 4. Alter plan_participants.rsvp_status to use the new type
ALTER TABLE public.plan_participants ALTER COLUMN rsvp_status DROP DEFAULT;

ALTER TABLE public.plan_participants 
  ALTER COLUMN rsvp_status TYPE public.rsvp_status 
  USING (
    CASE 
      WHEN rsvp_status::text IN ('DECLINED', 'LEFT', 'REMOVED') THEN 'SKIPPED'::public.rsvp_status
      WHEN rsvp_status::text = 'JOINED' THEN 'JOINED'::public.rsvp_status
      ELSE 'INVITED'::public.rsvp_status
    END
  );

-- 5. Restore default
ALTER TABLE public.plan_participants ALTER COLUMN rsvp_status SET DEFAULT 'INVITED'::public.rsvp_status;

-- 6. Drop old type
DROP TYPE public.rsvp_status_old;

-- 7. Rename notification_type
ALTER TYPE public.notification_type RENAME TO notification_type_old;

-- 8. Create new notification_type
CREATE TYPE public.notification_type AS ENUM (
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

-- 9. Alter notifications table to use the new type
ALTER TABLE public.notifications ALTER COLUMN type TYPE public.notification_type 
  USING (
    CASE 
      WHEN type::text = 'PARTICIPANT_LEFT' THEN 'PARTICIPANT_SKIPPED'::public.notification_type
      ELSE type::text::public.notification_type
    END
  );

-- 10. Drop old type
DROP TYPE public.notification_type_old;
