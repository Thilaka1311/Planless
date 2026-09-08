-- Migration: 031_enforce_circle_host_invariant
-- Description: Enforce exactly one Host per Circle database-level constraint trigger (deferred until commit)

CREATE OR REPLACE FUNCTION check_circle_host_invariant()
RETURNS TRIGGER AS $$
DECLARE
    host_count INTEGER;
    current_circle_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        current_circle_id := OLD.circle_id;
    ELSE
        current_circle_id := NEW.circle_id;
    END IF;

    -- Count the number of creator_admins in this circle
    SELECT COUNT(*) INTO host_count 
    FROM public.circle_members 
    WHERE circle_id = current_circle_id AND role = 'creator_admin';

    -- Enforce invariant: exactly one creator_admin
    IF host_count <> 1 THEN
        RAISE EXCEPTION 'Constraint Violation: Circle % must have exactly one Creator Admin. Found %.', current_circle_id, host_count;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_enforce_circle_host_invariant ON public.circle_members;

CREATE CONSTRAINT TRIGGER tr_enforce_circle_host_invariant
AFTER INSERT OR UPDATE OR DELETE
ON public.circle_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_circle_host_invariant();
