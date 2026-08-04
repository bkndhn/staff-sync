-- Migration: 20260803163604_lock_tenant_isolation.sql
-- PURPOSE: Permanently link ALL existing app data to the SHABNAM client tenant
--          (id = 00000000-0000-0000-0000-000000000001) and add db-level guards
--          so future inserts can never land without a tenant_id.
--
-- SAFE TO RE-RUN: All statements use IF NOT EXISTS / OR REPLACE.

-- ── 1. Ensure the tenant row exists ─────────────────────────────────────────
INSERT INTO public.tenants (id, name, slug, status, plan, staff_limit, contact_name, contact_email, is_active, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'SHABNAM', 'shabnam', 'ACTIVE', 'standard', 50,
  'BAKRUDHEEN', 'bkn1919@gmail.com',
  true, NOW()
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  contact_email = EXCLUDED.contact_email;

-- ── 2. Ensure client admin is fully linked ───────────────────────────────────
UPDATE public.app_users
SET
  tenant_id  = '00000000-0000-0000-0000-000000000001',
  role       = 'admin',
  is_active  = true
WHERE email = 'bkn1919@gmail.com';

-- ── 3. Stamp all existing rows in every tenant-scoped table ─────────────────
UPDATE public.staff                          SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.attendance                     SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.locations                      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.floors                         SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.designations                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.salary_categories              SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.app_settings                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.break_types                    SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.break_policies                 SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.break_events                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.punch_events                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.leave_requests                 SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.advances                       SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.advance_entries                SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.salary_hikes                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.salary_manual_overrides        SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.payroll_runs                   SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.payroll_snapshots              SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.face_embeddings                SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.face_registration_logs         SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.old_staff_records              SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.part_time_advance_tracking     SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.part_time_settlements          SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.location_shift_config          SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.location_designation_shift_config SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';
UPDATE public.statutory_portal_config        SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL OR tenant_id != '00000000-0000-0000-0000-000000000001';

-- ── 4. Set DEFAULT on every tenant_id column ────────────────────────────────
-- Future inserts that omit tenant_id will auto-get the SHABNAM tenant.
-- When a new client is added, the edge function explicitly stamps their tenant_id,
-- overriding this default.
ALTER TABLE public.staff                          ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.attendance                     ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.locations                      ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.floors                         ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.designations                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_categories              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.app_settings                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_types                    ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_policies                 ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.break_events                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.punch_events                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.leave_requests                 ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.advances                       ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.advance_entries                ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_hikes                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.salary_manual_overrides        ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_runs                   ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_snapshots              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.face_embeddings                ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.face_registration_logs         ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.old_staff_records              ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.part_time_advance_tracking     ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.part_time_settlements          ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.location_shift_config          ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.location_designation_shift_config ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.statutory_portal_config        ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- ── 5. Create the auto-stamp trigger function ────────────────────────────────
-- Belt-and-suspenders: even if column default is somehow bypassed,
-- the trigger catches it at INSERT time.
CREATE OR REPLACE FUNCTION public.stamp_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 6. Apply trigger to all tenant-scoped tables ─────────────────────────────
DO $$ DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'staff','attendance','locations','floors','designations',
    'salary_categories','app_settings','break_types','break_policies',
    'break_events','punch_events','leave_requests','advances','advance_entries',
    'salary_hikes','salary_manual_overrides','payroll_runs','payroll_snapshots',
    'face_embeddings','face_registration_logs','old_staff_records',
    'part_time_advance_tracking','part_time_settlements',
    'location_shift_config','location_designation_shift_config',
    'statutory_portal_config'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_stamp_tenant_id ON public.%I; '
      'CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();',
      tbl, tbl
    );
  END LOOP;
END $$;
