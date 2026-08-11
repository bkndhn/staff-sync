-- Migration: Create update_tenant_slug function

CREATE OR REPLACE FUNCTION public.update_tenant_slug(p_tenant_id UUID, p_new_slug TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_user_tenant_id UUID;
    v_count INT;
BEGIN
    -- Verify the caller's auth status
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get caller's role and tenant_id
    SELECT role, tenant_id INTO v_role, v_user_tenant_id 
    FROM public.app_users 
    WHERE id = auth.uid();

    -- Check if user is an admin for this tenant, or a super_admin
    IF (v_role = 'admin' AND v_user_tenant_id = p_tenant_id) OR v_role = 'super_admin' THEN
        -- Check if slug is unique (excluding current tenant)
        SELECT count(*) INTO v_count FROM public.tenants WHERE slug = p_new_slug AND id != p_tenant_id;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Slug already in use';
        END IF;

        -- Update the slug
        UPDATE public.tenants SET slug = p_new_slug WHERE id = p_tenant_id;
        RETURN TRUE;
    ELSE
        RAISE EXCEPTION 'Permission denied';
    END IF;
END;
$$;
