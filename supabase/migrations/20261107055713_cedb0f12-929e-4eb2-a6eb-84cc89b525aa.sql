CREATE TABLE public.tax_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  fy text NOT NULL,
  regime text NOT NULL DEFAULT 'new',
  items jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'Submitted',
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, fy)
);
GRANT ALL ON public.tax_declarations TO service_role;
ALTER TABLE public.tax_declarations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.tax_declarations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_tax_declaration()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.regime NOT IN ('new','old') THEN RAISE EXCEPTION 'Regime must be new or old'; END IF;
  IF NEW.status NOT IN ('Submitted','Approved','Rejected') THEN RAISE EXCEPTION 'Unknown status %', NEW.status; END IF;
  IF NEW.fy !~ '^[0-9]{4}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid financial year'; END IF;
  IF jsonb_typeof(NEW.items) <> 'object' THEN RAISE EXCEPTION 'Invalid items'; END IF;
  -- Any change to what the employee declared sends it back for review.
  IF TG_OP = 'UPDATE' AND (NEW.regime IS DISTINCT FROM OLD.regime OR NEW.items IS DISTINCT FROM OLD.items)
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    NEW.status := 'Submitted'; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  END IF;
  NEW.review_notes := left(NEW.review_notes, 500);
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER tax_declarations_validate BEFORE INSERT OR UPDATE ON public.tax_declarations
  FOR EACH ROW EXECUTE FUNCTION public.validate_tax_declaration();
CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.tax_declarations
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();