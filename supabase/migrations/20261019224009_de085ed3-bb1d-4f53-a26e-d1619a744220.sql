CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Seal stamped by the server at insert; current_hash always reflects stored data.
ALTER TABLE public.payroll_snapshots ADD COLUMN IF NOT EXISTS seal text;
ALTER TABLE public.payroll_snapshots ADD COLUMN IF NOT EXISTS current_hash text
  GENERATED ALWAYS AS (encode(extensions.digest(run_id::text || '|' || staff_id::text || '|' || salary_detail::text, 'sha256'), 'hex')) STORED;

UPDATE public.payroll_snapshots
SET seal = encode(extensions.digest(run_id::text || '|' || staff_id::text || '|' || salary_detail::text, 'sha256'), 'hex')
WHERE seal IS NULL;

CREATE OR REPLACE FUNCTION public.payroll_snapshot_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_status text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.seal := encode(extensions.digest(NEW.run_id::text || '|' || NEW.staff_id::text || '|' || NEW.salary_detail::text, 'sha256'), 'hex');
    RETURN NEW;
  END IF;
  SELECT status INTO v_status FROM public.payroll_runs WHERE id = OLD.run_id;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Payroll lines are sealed and cannot be edited. Regenerate the run instead.';
  END IF;
  IF v_status IN ('Approved','Locked') THEN
    RAISE EXCEPTION 'Payroll is approved/locked and cannot be changed.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_snapshot_guard ON public.payroll_snapshots;
CREATE TRIGGER trg_payroll_snapshot_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_snapshots
FOR EACH ROW EXECUTE FUNCTION public.payroll_snapshot_guard();

CREATE OR REPLACE FUNCTION public.payroll_run_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Approved','Locked') THEN
      RAISE EXCEPTION 'Approved/locked payroll cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'Locked' THEN
    RAISE EXCEPTION 'Locked payroll is immutable.';
  END IF;
  IF OLD.status = 'Approved' AND (NEW.status <> 'Locked' OR NEW.total_net IS DISTINCT FROM OLD.total_net OR NEW.headcount IS DISTINCT FROM OLD.headcount OR NEW.month <> OLD.month OR NEW.year <> OLD.year) THEN
    RAISE EXCEPTION 'Approved payroll can only be locked.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payroll_run_guard ON public.payroll_runs;
CREATE TRIGGER trg_payroll_run_guard
BEFORE UPDATE OR DELETE ON public.payroll_runs
FOR EACH ROW EXECUTE FUNCTION public.payroll_run_guard();