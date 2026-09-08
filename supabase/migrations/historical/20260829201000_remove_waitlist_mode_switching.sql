-- Drop the waitlist mode switching RPC
-- Since waitlist mode is now permanent after creation, we no longer need the ability to switch.
DROP FUNCTION IF EXISTS public.switch_to_automatic_waitlist_mode(uuid, uuid[]);
