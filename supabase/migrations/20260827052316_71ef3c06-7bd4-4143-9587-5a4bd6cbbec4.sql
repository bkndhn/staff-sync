DROP FUNCTION IF EXISTS public.get_tenant_by_slug(text);

CREATE OR REPLACE FUNCTION public.update_tenant_slug(p_tenant_id uuid, p_new_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_role TEXT;
    v_user_tenant_id UUID;
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, tenant_id INTO v_role, v_user_tenant_id
    FROM public.app_users
    WHERE auth_id = auth.uid() AND is_active = true;

    IF (v_role = 'admin' AND v_user_tenant_id = p_tenant_id) OR v_role = 'super_admin' THEN
        SELECT count(*) INTO v_count FROM public.tenants WHERE slug = p_new_slug AND id != p_tenant_id;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'Slug already in use';
        END IF;

        UPDATE public.tenants SET slug = p_new_slug WHERE id = p_tenant_id;
        RETURN TRUE;
    END IF;

    RAISE EXCEPTION 'Permission denied';
END;
$function$;

REVOKE ALL ON FUNCTION public.update_tenant_slug(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_slug(uuid, text) TO service_role;