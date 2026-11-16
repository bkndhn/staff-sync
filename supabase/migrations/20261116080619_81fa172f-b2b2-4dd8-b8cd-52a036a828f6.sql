ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS reopened_by text,
  ADD COLUMN IF NOT EXISTS reopened_at timestamptz,
  ADD COLUMN IF NOT EXISTS reopen_reason text,
  ADD COLUMN IF NOT EXISTS reopen_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.payroll_run_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('Approved','Locked') THEN
      RAISE EXCEPTION 'Approved/locked payroll cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'Locked' THEN
    -- Only an authorised reopening may change a closed period.
    IF NEW.status <> 'Rejected' OR coalesce(NEW.reopened_by,'') = '' OR length(trim(coalesce(NEW.reopen_reason,''))) < 10 THEN
      RAISE EXCEPTION 'Locked payroll is immutable. Reopen it with a reason (10+ characters).';
    END IF;
    IF NEW.total_net IS DISTINCT FROM OLD.total_net OR NEW.headcount IS DISTINCT FROM OLD.headcount OR NEW.month <> OLD.month OR NEW.year <> OLD.year THEN
      RAISE EXCEPTION 'Reopening cannot change payroll figures.';
    END IF;
    NEW.reopened_at := now();
    NEW.reopen_count := OLD.reopen_count + 1;
    NEW.rejection_reason := 'Reopened: ' || left(NEW.reopen_reason, 480);
    INSERT INTO public.audit_logs(tenant_id, action, details, performed_by, actor_id, before, after, metadata)
    VALUES (NEW.tenant_id, 'payroll_reopened',
      format('Payroll %s/%s reopened: %s', NEW.month + 1, NEW.year, NEW.reopen_reason),
      NEW.reopened_by, NEW.reopened_by,
      jsonb_build_object('status', OLD.status, 'locked_at', OLD.locked_at, 'total_net', OLD.total_net),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('run_id', NEW.id, 'reopen_count', NEW.reopen_count));
    RETURN NEW;
  END IF;
  IF NEW.reopened_by IS DISTINCT FROM OLD.reopened_by OR NEW.reopen_reason IS DISTINCT FROM OLD.reopen_reason THEN
    NEW.reopened_by := OLD.reopened_by; NEW.reopen_reason := OLD.reopen_reason; NEW.reopened_at := OLD.reopened_at; NEW.reopen_count := OLD.reopen_count;
  END IF;
  IF OLD.status = 'Approved' AND (NEW.status <> 'Locked' OR NEW.total_net IS DISTINCT FROM OLD.total_net OR NEW.headcount IS DISTINCT FROM OLD.headcount OR NEW.month <> OLD.month OR NEW.year <> OLD.year) THEN
    RAISE EXCEPTION 'Approved payroll can only be locked.';
  END IF;
  IF NEW.status = 'Locked' AND OLD.status <> 'Locked' THEN
    INSERT INTO public.audit_logs(tenant_id, action, details, performed_by, actor_id, metadata)
    VALUES (NEW.tenant_id, 'payroll_locked', format('Payroll %s/%s locked', NEW.month + 1, NEW.year),
      coalesce(NEW.approved_by,'system'), NEW.approved_by, jsonb_build_object('run_id', NEW.id));
  END IF;
  RETURN NEW;
END $function$;