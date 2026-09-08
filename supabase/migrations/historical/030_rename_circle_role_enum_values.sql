-- Migration: 030_rename_circle_role_enum_values
-- Description: Rename enum values of circle_role to lower-case canonical roles

ALTER TYPE circle_role RENAME VALUE 'CREATOR' TO 'creator_admin';
ALTER TYPE circle_role RENAME VALUE 'ADMIN' TO 'admin';
ALTER TYPE circle_role RENAME VALUE 'MEMBER' TO 'member';
