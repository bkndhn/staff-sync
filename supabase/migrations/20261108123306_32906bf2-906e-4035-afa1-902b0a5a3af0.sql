CREATE TABLE public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  month int NOT NULL, year int NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  bank_format text NOT NULL DEFAULT 'generic',
  debit_account text,
  total_amount numeric NOT NULL DEFAULT 0,
  payee_count int NOT NULL DEFAULT 0,
  created_by text, approved_by text, approved_at timestamptz,
  exported_by text, exported_at timestamptz,
  completed_by text, completed_at timestamptz,
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payout_batches TO service_role;
ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.payout_batches FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.payout_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  month int NOT NULL, year int NOT NULL,
  staff_name text, net_amount numeric NOT NULL,
  bank_account_number text NOT NULL, ifsc_code text NOT NULL,
  payment_mode text NOT NULL DEFAULT 'NEFT',
  status text NOT NULL DEFAULT 'Pending',
  utr_ref text, failure_reason text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.payout_batch_items TO service_role;
ALTER TABLE public.payout_batch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.payout_batch_items FOR ALL TO service_role USING (true) WITH CHECK (true);
-- One active payout line per employee per salary month (no duplicate payouts).
CREATE UNIQUE INDEX payout_items_one_active ON public.payout_batch_items (staff_id, month, year) WHERE active;
CREATE INDEX payout_items_batch ON public.payout_batch_items (batch_id);

CREATE OR REPLACE FUNCTION public.payout_batch_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('Draft','Approved','Exported','Completed','Cancelled') THEN RAISE EXCEPTION 'Unknown status %', NEW.status; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'Draft' THEN RAISE EXCEPTION 'New batches start as Draft'; END IF;
    NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.exported_at := NULL; NEW.completed_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('Completed','Cancelled') THEN RAISE EXCEPTION 'This batch is closed'; END IF;
  IF OLD.status <> 'Draft' AND (NEW.total_amount IS DISTINCT FROM OLD.total_amount OR NEW.payee_count IS DISTINCT FROM OLD.payee_count
     OR NEW.month <> OLD.month OR NEW.year <> OLD.year OR NEW.debit_account IS DISTINCT FROM OLD.debit_account) THEN
    RAISE EXCEPTION 'Approved batches cannot be changed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status='Draft' AND NEW.status IN ('Approved','Cancelled'))
         OR (OLD.status='Approved' AND NEW.status IN ('Exported','Cancelled'))
         OR (OLD.status='Exported' AND NEW.status IN ('Completed','Cancelled'))) THEN
      RAISE EXCEPTION 'Cannot move batch from % to %', OLD.status, NEW.status;
    END IF;
    IF NEW.status='Approved' THEN
      IF coalesce(NEW.approved_by,'')='' THEN RAISE EXCEPTION 'Approver required'; END IF;
      IF NEW.approved_by = OLD.created_by THEN RAISE EXCEPTION 'The batch must be approved by someone other than its creator'; END IF;
      IF OLD.payee_count = 0 THEN RAISE EXCEPTION 'Empty batch'; END IF;
      NEW.approved_at := now();
    END IF;
    IF NEW.status='Exported' THEN NEW.exported_at := coalesce(OLD.exported_at, now()); END IF;
    IF NEW.status='Completed' THEN
      IF EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=NEW.id AND status IN ('Pending','Exported')) THEN
        RAISE EXCEPTION 'Mark every line Paid or Failed before completing';
      END IF;
      NEW.completed_at := now();
    END IF;
    IF NEW.status='Cancelled' THEN
      IF EXISTS (SELECT 1 FROM payout_batch_items WHERE batch_id=NEW.id AND status='Paid') THEN
        RAISE EXCEPTION 'Batch has paid lines and cannot be cancelled';
      END IF;
      UPDATE payout_batch_items SET active=false WHERE batch_id=NEW.id;
    END IF;
  ELSE
    NEW.approved_by := OLD.approved_by; NEW.approved_at := OLD.approved_at;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER payout_batch_guard BEFORE INSERT OR UPDATE ON public.payout_batches FOR EACH ROW EXECUTE FUNCTION public.payout_batch_guard();
CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.payout_batches FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

CREATE OR REPLACE FUNCTION public.payout_item_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE b text;
BEGIN
  SELECT status INTO b FROM payout_batches WHERE id = coalesce(NEW.batch_id, OLD.batch_id);
  IF TG_OP = 'DELETE' THEN
    IF b <> 'Draft' THEN RAISE EXCEPTION 'Lines can be removed only from Draft batches'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.status NOT IN ('Pending','Exported','Paid','Failed') THEN RAISE EXCEPTION 'Unknown line status %', NEW.status; END IF;
  IF TG_OP = 'INSERT' THEN
    IF b <> 'Draft' THEN RAISE EXCEPTION 'Lines can be added only to Draft batches'; END IF;
    IF NEW.net_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
    IF upper(NEW.ifsc_code) !~ '^[A-Z]{4}0[A-Z0-9]{6}$' THEN RAISE EXCEPTION 'Invalid IFSC %', NEW.ifsc_code; END IF;
    IF NEW.bank_account_number !~ '^[0-9]{9,18}$' THEN RAISE EXCEPTION 'Invalid account number'; END IF;
    NEW.status := 'Pending'; NEW.active := true;
    RETURN NEW;
  END IF;
  IF NEW.active AND NOT OLD.active THEN RAISE EXCEPTION 'Cancelled lines cannot be reactivated'; END IF;
  IF b <> 'Draft' AND (NEW.net_amount IS DISTINCT FROM OLD.net_amount OR NEW.bank_account_number IS DISTINCT FROM OLD.bank_account_number
     OR NEW.ifsc_code IS DISTINCT FROM OLD.ifsc_code OR NEW.staff_id IS DISTINCT FROM OLD.staff_id) THEN
    RAISE EXCEPTION 'Approved payout lines cannot be changed';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'Exported' AND b NOT IN ('Approved','Exported') THEN RAISE EXCEPTION 'Batch must be approved before export'; END IF;
    IF NEW.status IN ('Paid','Failed') AND b <> 'Exported' THEN RAISE EXCEPTION 'Only exported lines can be confirmed'; END IF;
    IF NEW.status = 'Paid' AND coalesce(trim(NEW.utr_ref),'') = '' THEN RAISE EXCEPTION 'Bank reference (UTR) required to mark paid'; END IF;
    IF OLD.status = 'Paid' THEN RAISE EXCEPTION 'Paid lines are final'; END IF;
    -- A failed line frees the employee for a new batch.
    IF NEW.status = 'Failed' THEN NEW.active := false; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER payout_item_guard BEFORE INSERT OR UPDATE OR DELETE ON public.payout_batch_items FOR EACH ROW EXECUTE FUNCTION public.payout_item_guard();
CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.payout_batch_items FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();