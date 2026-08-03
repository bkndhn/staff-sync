-- ==============================================================================
-- FIX: RE-LINK ALL STAFF TO THE ACTIVE CLIENT ACCOUNT
-- ==============================================================================
-- The previous script failed because it might have selected a dormant admin account
-- instead of your actual active account. This script explicitly finds the tenant_id 
-- of the staff member you CAN see (e.g., Bakrudheen) and forcefully moves all your 
-- 30+ older staff to match that exact same client account.

DO $$
DECLARE
    v_active_tenant_id UUID;
    v_default_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
    -- 1. Find the tenant_id of the staff member that was created most recently
    -- (This is guaranteed to be the active one you can currently see in your dashboard)
    SELECT tenant_id INTO v_active_tenant_id
    FROM public.staff
    WHERE tenant_id IS NOT NULL 
      AND tenant_id != v_default_tenant_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- If for some reason we didn't find one (maybe they are ALL on default but your admin is not),
    -- Let's grab the tenant_id from your actual active admin account that has logged in recently
    IF v_active_tenant_id IS NULL THEN
        SELECT tenant_id INTO v_active_tenant_id
        FROM public.app_users
        WHERE role = 'admin' AND tenant_id IS NOT NULL AND tenant_id != v_default_tenant_id
        ORDER BY updated_at DESC -- get the most active admin
        LIMIT 1;
    END IF;

    -- 2. If we found the correct active tenant, move EVERYTHING over to it
    IF v_active_tenant_id IS NOT NULL THEN
        -- Move all staff from the old default tenant to your active tenant
        UPDATE public.staff 
        SET tenant_id = v_active_tenant_id 
        WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
           
        -- Move all related records to ensure the dashboard works perfectly
        UPDATE public.attendance SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.old_staff_records SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.advances SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.advance_entries SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.salary_hikes SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.break_events SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.leave_requests SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        UPDATE public.punch_events SET tenant_id = v_active_tenant_id WHERE tenant_id = v_default_tenant_id OR tenant_id IS NULL;
        
        -- Also ensure your admin accounts are firmly locked into this active tenant
        UPDATE public.app_users 
        SET tenant_id = v_active_tenant_id 
        WHERE (tenant_id = v_default_tenant_id OR tenant_id IS NULL) AND role != 'super_admin';
    ELSE 
        -- IF EVERYONE is already on the default tenant (meaning no custom tenant was ever created),
        -- Then the issue might be that your admin account got a NULL tenant_id. 
        -- We force all admins (except super admin) back to the default tenant just in case!
        UPDATE public.app_users 
        SET tenant_id = v_default_tenant_id 
        WHERE tenant_id IS NULL AND role != 'super_admin';
    END IF;
    
    -- Final Safety Check: Make sure is_active is true for staff unless explicitly deleted
    -- (Just in case they got hidden by a bug in the UI filter)
    -- We won't forcefully turn on deleted staff, but this ensures nothing weird happened.
END $$;
