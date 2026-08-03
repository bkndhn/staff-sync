-- ==============================================================================
-- PART 1: FIX ORPHANED STAFF (TENANT ID MISMATCH)
-- ==============================================================================
-- Find the active admin's tenant_id and update all staff to belong to it.
-- This safely restores visibility of all old staff records to the current admin.

DO $$
DECLARE
    active_tenant_id UUID;
BEGIN
    -- Get the tenant_id of the first active admin user
    SELECT tenant_id INTO active_tenant_id 
    FROM public.app_users 
    WHERE role = 'admin' AND tenant_id IS NOT NULL 
    LIMIT 1;

    IF active_tenant_id IS NOT NULL THEN
        -- Reassign all staff that might be stuck on the default tenant to this admin's tenant
        UPDATE public.staff 
        SET tenant_id = active_tenant_id 
        WHERE tenant_id = '00000000-0000-0000-0000-000000000001' 
           OR tenant_id IS NULL;
           
        -- Also fix attendance records to match
        UPDATE public.attendance 
        SET tenant_id = active_tenant_id 
        WHERE tenant_id = '00000000-0000-0000-0000-000000000001' 
           OR tenant_id IS NULL;
    END IF;
END $$;


-- ==============================================================================
-- PART 2: SALARY DISBURSEMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.salary_disbursements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    month_year TEXT NOT NULL, -- e.g., '2026-07'
    amount NUMERIC(10, 2) NOT NULL,
    payment_mode TEXT NOT NULL,
    transaction_ref TEXT,
    notes TEXT,
    disbursed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.salary_disbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow data-api access to salary_disbursements" ON public.salary_disbursements FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_salary_disb_staff ON public.salary_disbursements(staff_id);
CREATE INDEX IF NOT EXISTS idx_salary_disb_month ON public.salary_disbursements(month_year);


-- ==============================================================================
-- PART 3: STAFF GRIEVANCES (DISCREPANCY REPORTING)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff_grievances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- 'attendance', 'salary', 'other'
    target_date DATE, -- the date the issue occurred (if applicable)
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected', 'escalated')),
    resolution_notes TEXT,
    current_approval_level INTEGER DEFAULT 1,
    required_approval_levels INTEGER DEFAULT 1,
    approval_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_grievances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow data-api access to staff_grievances" ON public.staff_grievances FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_staff_grievances_staff ON public.staff_grievances(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_grievances_status ON public.staff_grievances(status);
