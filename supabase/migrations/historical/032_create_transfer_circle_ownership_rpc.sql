-- Migration: 032_create_transfer_circle_ownership_rpc
-- Description: Create plpgsql function to transfer circle ownership atomically, avoiding constraint trigger violation

CREATE OR REPLACE FUNCTION transfer_circle_ownership(
    p_circle_id UUID,
    p_old_host_id UUID,
    p_new_host_id UUID
) RETURNS VOID AS $$
BEGIN
    -- 1. Demote old creator_admin to admin
    UPDATE public.circle_members 
    SET role = 'admin'::circle_role
    WHERE circle_id = p_circle_id AND user_id = p_old_host_id;

    -- 2. Promote new user to creator_admin
    UPDATE public.circle_members 
    SET role = 'creator_admin'::circle_role
    WHERE circle_id = p_circle_id AND user_id = p_new_host_id;

    -- 3. Update circles table creator reference
    UPDATE public.circles 
    SET created_by = p_new_host_id
    WHERE id = p_circle_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
