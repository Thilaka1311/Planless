-- Migration: 052_add_username_to_users
-- Description: Add a nullable username column to the users table with a max length constraint.

ALTER TABLE users 
ADD COLUMN username TEXT DEFAULT NULL,
ADD CONSTRAINT username_length_check CHECK (username IS NULL OR char_length(username) <= 30);
