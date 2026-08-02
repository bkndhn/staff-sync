-- Add staff limit to tenants
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS staff_limit INT NOT NULL DEFAULT 50;

-- Create function to enforce limit
CREATE OR REPLACE FUNCTION check_tenant_staff_limit()
RETURNS TRIGGER AS $$
DECLARE
    current_count INT;
    max_limit INT;
BEGIN
    -- Get current staff count for this tenant
    SELECT COUNT(*) INTO current_count 
    FROM public.staff 
    WHERE tenant_id = NEW.tenant_id;
    
    -- Get the tenant's limit
    SELECT staff_limit INTO max_limit 
    FROM public.tenants 
    WHERE id = NEW.tenant_id;
    
    -- If current count >= limit, raise exception
    IF current_count >= max_limit THEN
        RAISE EXCEPTION 'Staff limit (%) reached for this client. Please contact Super Admin to upgrade.', max_limit;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on staff table
DROP TRIGGER IF EXISTS enforce_staff_limit ON public.staff;
CREATE TRIGGER enforce_staff_limit
BEFORE INSERT ON public.staff
FOR EACH ROW
EXECUTE FUNCTION check_tenant_staff_limit();
