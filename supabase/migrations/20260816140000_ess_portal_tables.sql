-- Migration: 20260816140000_ess_portal_tables.sql
-- Description: Creates Employee Self-Service (ESS) Portal tables:
--   1. profile_change_requests
--   2. attendance_regularizations
--   3. letter_requests
--   4. holidays
--   5. staff_notifications

-- ==============================================================================
-- 1. Table: profile_change_requests
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  requested_changes JSONB NOT NULL, -- e.g. {"address": "new address", "bank_name": "SBI"}
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.app_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profile_change_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only on profile_change_requests" ON public.profile_change_requests;
CREATE POLICY "Service role only on profile_change_requests" ON public.profile_change_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow data-api access to profile_change_requests" ON public.profile_change_requests;
CREATE POLICY "Allow data-api access to profile_change_requests" ON public.profile_change_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_profile_change_requests_staff ON public.profile_change_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_tenant_status ON public.profile_change_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_tenant ON public.profile_change_requests(tenant_id);

-- ==============================================================================
-- 2. Table: attendance_regularizations
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.attendance_regularizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  target_date DATE NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('missed_punch', 'wrong_status', 'overtime', 'half_day_correction')),
  current_status TEXT,
  requested_status TEXT,
  punch_in_time TEXT,
  punch_out_time TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.app_users(id),
  reviewed_at TIMESTAMPTZ,
  current_approval_level INTEGER DEFAULT 1,
  required_approval_levels INTEGER DEFAULT 1,
  approval_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.attendance_regularizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only on attendance_regularizations" ON public.attendance_regularizations;
CREATE POLICY "Service role only on attendance_regularizations" ON public.attendance_regularizations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow data-api access to attendance_regularizations" ON public.attendance_regularizations;
CREATE POLICY "Allow data-api access to attendance_regularizations" ON public.attendance_regularizations
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_attendance_regularizations_staff ON public.attendance_regularizations(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_regularizations_tenant_status ON public.attendance_regularizations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_regularizations_target_date ON public.attendance_regularizations(target_date);
CREATE INDEX IF NOT EXISTS idx_attendance_regularizations_tenant ON public.attendance_regularizations(tenant_id);

-- ==============================================================================
-- 3. Table: letter_requests
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.letter_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  letter_type TEXT NOT NULL CHECK (letter_type IN ('employment_proof', 'salary_certificate', 'experience_letter', 'custom')),
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'rejected')),
  generated_url TEXT,
  admin_notes TEXT,
  generated_by UUID REFERENCES public.app_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.letter_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only on letter_requests" ON public.letter_requests;
CREATE POLICY "Service role only on letter_requests" ON public.letter_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow data-api access to letter_requests" ON public.letter_requests;
CREATE POLICY "Allow data-api access to letter_requests" ON public.letter_requests
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_letter_requests_staff ON public.letter_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_letter_requests_tenant_status ON public.letter_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_letter_requests_tenant ON public.letter_requests(tenant_id);

-- ==============================================================================
-- 4. Table: holidays
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'custom' CHECK (type IN ('national', 'regional', 'restricted', 'custom')),
  is_optional BOOLEAN NOT NULL DEFAULT false,
  applicable_locations TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only on holidays" ON public.holidays;
CREATE POLICY "Service role only on holidays" ON public.holidays
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to holidays" ON public.holidays;
CREATE POLICY "Allow read access to holidays" ON public.holidays
  FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_holidays_tenant_date ON public.holidays(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON public.holidays(date);
CREATE INDEX IF NOT EXISTS idx_holidays_tenant ON public.holidays(tenant_id);

-- ==============================================================================
-- 5. Table: staff_notifications
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.staff_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('leave_approved', 'leave_rejected', 'salary_generated', 'grievance_resolved', 'regularization_approved', 'regularization_rejected', 'letter_ready', 'profile_approved', 'profile_rejected', 'announcement', 'general')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only on staff_notifications" ON public.staff_notifications;
CREATE POLICY "Service role only on staff_notifications" ON public.staff_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow data-api access to staff_notifications" ON public.staff_notifications;
CREATE POLICY "Allow data-api access to staff_notifications" ON public.staff_notifications
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_staff_notifications_staff_read_created ON public.staff_notifications(staff_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_tenant ON public.staff_notifications(tenant_id);

-- ==============================================================================
-- 6. Tenant Auto-stamp Triggers
-- ==============================================================================
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'stamp_tenant_id') THEN
    DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.profile_change_requests;
    CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.profile_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

    DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.attendance_regularizations;
    CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.attendance_regularizations
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

    DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.letter_requests;
    CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.letter_requests
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

    DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.holidays;
    CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.holidays
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

    DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.staff_notifications;
    CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.staff_notifications
    FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
  END IF;
END $$;
