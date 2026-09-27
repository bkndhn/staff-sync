DROP POLICY IF EXISTS "Allow all access to leave_requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Allow all operations on old_staff_records for all users" ON public.old_staff_records;
DROP POLICY IF EXISTS "Allow all operations on salary_hikes for all users" ON public.salary_hikes;
DROP POLICY IF EXISTS "Allow authenticated read/write on petty_cash_expenses" ON public.petty_cash_expenses;
DROP POLICY IF EXISTS "Allow authenticated read/write on petty_cash_sheets" ON public.petty_cash_sheets;
DROP POLICY IF EXISTS "Allow authenticated read/write on petty_cash_staff_meals" ON public.petty_cash_staff_meals;
DROP POLICY IF EXISTS "Allow authenticated read/write on petty_cash_transports" ON public.petty_cash_transports;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.payroll_runs;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.payroll_snapshots;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "break_policies_read_all" ON public.break_policies;
DROP POLICY IF EXISTS "break_types_read_all" ON public.break_types;
DROP POLICY IF EXISTS "designations_read_all" ON public.designations;
DROP POLICY IF EXISTS "floors_read_all" ON public.floors;
DROP POLICY IF EXISTS "location_designation_shift_config_read_all" ON public.location_designation_shift_config;
DROP POLICY IF EXISTS "location_shift_config_read_all" ON public.location_shift_config;
DROP POLICY IF EXISTS "portal cfg readable" ON public.statutory_portal_config;
DROP POLICY IF EXISTS "salary_categories_read_all" ON public.salary_categories;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.old_staff_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_hikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_staff_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash_transports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_manual_overrides ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.leave_requests, public.old_staff_records, public.salary_hikes,
  public.petty_cash_expenses, public.petty_cash_sheets, public.petty_cash_staff_meals, public.petty_cash_transports,
  public.payroll_runs, public.payroll_snapshots, public.salary_manual_overrides,
  public.break_policies, public.break_types, public.designations, public.floors,
  public.location_designation_shift_config, public.location_shift_config,
  public.statutory_portal_config, public.salary_categories TO service_role;