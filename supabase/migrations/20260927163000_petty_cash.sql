-- 1. Ensure app_users allows petty_cash_manager role
-- First try to drop constraint if it exists (names vary, usually app_users_role_check)
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
  EXCEPTION WHEN OTHERS THEN 
    NULL;
  END;
END $$;

ALTER TABLE public.app_users 
  ADD CONSTRAINT app_users_role_check 
  CHECK (role IN ('admin', 'manager', 'staff', 'statutory_admin', 'floor_supervisor', 'supervisor', 'super_admin', 'petty_cash_manager'));

-- 2. Create petty_cash_sheets table
CREATE TABLE IF NOT EXISTS public.petty_cash_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  location TEXT NOT NULL,
  date DATE NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('shop', 'godown')),
  total_received NUMERIC NOT NULL DEFAULT 0,
  staff_meals JSONB DEFAULT '[]'::jsonb,
  expenses JSONB DEFAULT '[]'::jsonb,
  transport_logistics JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.app_users(id),
  updated_by UUID REFERENCES public.app_users(id)
);

-- Unique constraint so we don't have multiple sheets for same location and date
ALTER TABLE public.petty_cash_sheets ADD CONSTRAINT petty_cash_sheets_loc_date_key UNIQUE (tenant_id, location, date);

-- RLS Policies
ALTER TABLE public.petty_cash_sheets ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on petty_cash_sheets"
ON public.petty_cash_sheets
TO service_role
USING (true)
WITH CHECK (true);

-- Allow authenticated access via data-api
-- Note: actual table access is managed via the edge function, but we still need these if using standard client
CREATE POLICY "Allow authenticated read access to petty_cash_sheets"
ON public.petty_cash_sheets
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Allow authenticated insert access to petty_cash_sheets"
ON public.petty_cash_sheets
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Allow authenticated update access to petty_cash_sheets"
ON public.petty_cash_sheets
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));
