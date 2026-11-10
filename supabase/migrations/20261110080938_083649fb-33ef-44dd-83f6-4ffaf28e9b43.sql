ALTER TABLE public.payout_batches ADD COLUMN is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.payout_batch_items ADD COLUMN is_test boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.payout_items_one_active;
CREATE UNIQUE INDEX payout_items_one_active ON public.payout_batch_items (staff_id, month, year) WHERE active AND NOT is_test;

CREATE OR REPLACE FUNCTION public.payout_test_flag_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE bt boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'payout_batches' THEN
      IF NOT OLD.is_test THEN RAISE EXCEPTION 'Only test batches can be deleted'; END IF;
    ELSIF NOT OLD.is_test THEN
      SELECT status INTO STRICT bt FROM (SELECT (status='Draft') AS status FROM payout_batches WHERE id=OLD.batch_id) s;
      IF NOT coalesce(bt,true) THEN RAISE EXCEPTION 'Lines can be removed only from Draft batches'; END IF;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'payout_batch_items' THEN
    SELECT is_test INTO bt FROM payout_batches WHERE id = NEW.batch_id;
    IF TG_OP = 'INSERT' THEN NEW.is_test := coalesce(bt,false); END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_test IS DISTINCT FROM OLD.is_test THEN
    RAISE EXCEPTION 'Test mode cannot be changed after creation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER payout_batch_test_flag BEFORE INSERT OR UPDATE OR DELETE ON public.payout_batches
  FOR EACH ROW EXECUTE FUNCTION public.payout_test_flag_guard();
CREATE TRIGGER payout_item_test_flag BEFORE INSERT OR UPDATE ON public.payout_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.payout_test_flag_guard();

-- Item delete: test lines may be removed in any batch status; real lines keep the Draft-only rule.
CREATE OR REPLACE FUNCTION public.payout_item_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE b text;
BEGIN
  SELECT status INTO b FROM payout_batches WHERE id = coalesce(NEW.batch_id, OLD.batch_id);
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_test THEN RETURN OLD; END IF;
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
    IF NEW.status = 'Failed' THEN NEW.active := false; END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $function$;