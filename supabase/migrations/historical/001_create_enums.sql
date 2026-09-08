-- Migration: 001_create_enums
-- Description: Create all core PostgreSQL enum types for Planless V2

CREATE TYPE plan_status AS ENUM (
  'LIVE',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE friendship_status AS ENUM (
  'PENDING',
  'ACCEPTED',
  'REJECTED'
);

CREATE TYPE notification_type AS ENUM (
  'PLAN_INVITATION',
  'PARTICIPANT_JOINED',
  'PARTICIPANT_LEFT',
  'PLAN_CANCELLED',
  'PLAN_REMINDER',
  'FRIEND_REQUEST',
  'FRIEND_REQUEST_ACCEPTED',
  'PAYMENT_RECEIVED',
  'PAYMENT_REMINDER',
  'MEMORY_GENERATED'
);

CREATE TYPE team_type AS ENUM (
  'TEAM_1',
  'TEAM_2'
);

CREATE TYPE wallet_status AS ENUM (
  'PENDING',
  'PAID'
);

CREATE TYPE activity_category AS ENUM (
  'SPORTS',
  'MOVIES',
  'DINING',
  'ENTERTAINMENT',
  'TRAVEL',
  'FITNESS',
  'STUDY',
  'OTHER'
);

CREATE TYPE activity_subcategory AS ENUM (
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

CREATE TYPE completion_status AS ENUM (
  'PENDING',
  'SUBMITTED',
  'VERIFIED'
);

CREATE TYPE rsvp_status AS ENUM (
  'INVITED',
  'JOINED',
  'DECLINED',
  'LEFT',
  'REMOVED'
);

CREATE TYPE participant_role AS ENUM (
  'HOST',
  'CO_HOST',
  'PARTICIPANT'
);

CREATE TYPE circle_role AS ENUM (
  'creator_admin',
  'admin',
  'member'
);

CREATE TYPE message_status AS ENUM (
  'SENT',
  'DELIVERED'
);

