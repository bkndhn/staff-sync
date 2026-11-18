ALTER TABLE public.app_users DROP CONSTRAINT app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role = ANY (ARRAY['admin','manager','staff','statutory_admin','floor_supervisor','supervisor','super_admin','petty_cash_manager','kitchen_incharge']));

CREATE TABLE public.accommodation_meals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name text,
  location text,
  date date NOT NULL,
  meal text NOT NULL,
  in_room text NOT NULL DEFAULT 'unknown',
  food text NOT NULL DEFAULT 'unknown',
  note text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, staff_id, date, meal)
);
GRANT ALL ON public.accommodation_meals TO service_role;
ALTER TABLE public.accommodation_meals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on accommodation_meals" ON public.accommodation_meals FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_accommodation_meal() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.meal NOT IN ('breakfast','lunch','dinner') THEN RAISE EXCEPTION 'Invalid meal'; END IF;
  IF NEW.in_room NOT IN ('unknown','in_room','at_work','away') THEN RAISE EXCEPTION 'Invalid room status'; END IF;
  IF NEW.food NOT IN ('unknown','eating','skip','parcel') THEN RAISE EXCEPTION 'Invalid food choice'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER accommodation_meals_validate BEFORE INSERT OR UPDATE ON public.accommodation_meals FOR EACH ROW EXECUTE FUNCTION public.validate_accommodation_meal();
CREATE TRIGGER accommodation_meals_tenant BEFORE INSERT ON public.accommodation_meals FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();