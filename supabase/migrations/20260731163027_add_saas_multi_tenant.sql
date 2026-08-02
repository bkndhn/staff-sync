CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for tenants
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow service role on tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow super_admin on tenants" ON public.tenants FOR ALL USING (true) WITH CHECK (true); -- data-api handles this

-- Insert Default Client
INSERT INTO public.tenants (id, name, status) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Client', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Add tenant_id to tables
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_policies ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_types ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.designations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.face_embeddings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.face_registration_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.floors ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.location_designation_shift_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.location_shift_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.old_staff_records ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.part_time_advance_tracking ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.part_time_settlements ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_runs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_snapshots ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.punch_events ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_categories ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_hikes ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_manual_overrides ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.statutory_portal_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.advances ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.advance_entries ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001';

-- Drop the role check constraint to allow super_admin
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- Create super admin auth.users and app_users if they don't exist
DO $$
DECLARE
    super_admin_id UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'app@superadmin.com') THEN
        INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, aud, role)
        VALUES (
            super_admin_id,
            '00000000-0000-0000-0000-000000000000',
            'app@superadmin.com',
            crypt('Qwe12345', gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            'authenticated',
            'authenticated'
        );
    ELSE
        SELECT id INTO super_admin_id FROM auth.users WHERE email = 'app@superadmin.com' LIMIT 1;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE email = 'app@superadmin.com') THEN
        INSERT INTO public.app_users (id, email, full_name, role, password_hash, is_active, tenant_id)
        VALUES (super_admin_id, 'app@superadmin.com', 'Super Admin', 'super_admin', 'a3nrdy', true, NULL);
    ELSE
        UPDATE public.app_users SET role = 'super_admin', tenant_id = NULL WHERE email = 'app@superadmin.com';
    END IF;
END $$;
