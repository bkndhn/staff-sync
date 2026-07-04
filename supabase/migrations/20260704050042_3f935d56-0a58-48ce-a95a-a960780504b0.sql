
-- STAFF: revoke everything, service_role only
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='staff' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.staff', p.policyname);
  END LOOP;
END $$;
REVOKE ALL ON public.staff FROM anon, authenticated, public;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_service_role_only" ON public.staff
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- CONFIG TABLES: anon/authenticated may READ; writes only via service_role
DO $$
DECLARE t text; p record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'designations','floors','break_types','break_policies',
    'salary_categories','location_shift_config','location_designation_shift_config'
  ] LOOP
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated, public', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
      t || '_read_all', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t || '_service_role_all', t
    );
  END LOOP;
END $$;

-- FACE-SAMPLES BUCKET: drop permissive object policies; leave service_role only
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND (qual ILIKE '%face-samples%' OR with_check ILIKE '%face-samples%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "face_samples_service_role_only"
  ON storage.objects FOR ALL TO service_role
  USING (bucket_id = 'face-samples')
  WITH CHECK (bucket_id = 'face-samples');
