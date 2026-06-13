
-- BREAK TYPES
CREATE TABLE public.break_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  default_minutes int NOT NULL DEFAULT 15,
  max_minutes int NOT NULL DEFAULT 30,
  is_paid boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_types TO anon, authenticated;
GRANT ALL ON public.break_types TO service_role;
ALTER TABLE public.break_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on break_types" ON public.break_types FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_break_types_updated BEFORE UPDATE ON public.break_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.break_types (name, code, default_minutes, max_minutes, is_paid, sort_order) VALUES
  ('Lunch Break', 'lunch', 30, 45, false, 1),
  ('Tea Break', 'tea', 15, 20, true, 2),
  ('Custom Break', 'custom', 10, 30, true, 3);

-- BREAK EVENTS
CREATE TABLE public.break_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  staff_name text,
  location text,
  date date NOT NULL,
  break_type_id uuid REFERENCES public.break_types(id),
  break_type_code text,
  start_time time NOT NULL,
  end_time time,
  duration_minutes int,
  source text NOT NULL DEFAULT 'web',
  device_label text,
  is_violation boolean NOT NULL DEFAULT false,
  violation_reason text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_break_events_staff_date ON public.break_events(staff_id, date);
CREATE INDEX idx_break_events_date ON public.break_events(date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_events TO anon, authenticated;
GRANT ALL ON public.break_events TO service_role;
ALTER TABLE public.break_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on break_events" ON public.break_events FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_break_events_updated BEFORE UPDATE ON public.break_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- BREAK POLICIES
CREATE TABLE public.break_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text,
  designation_id uuid,
  break_type_id uuid REFERENCES public.break_types(id) ON DELETE CASCADE,
  max_per_day int NOT NULL DEFAULT 1,
  max_minutes_per_break int NOT NULL DEFAULT 30,
  max_total_minutes_per_day int NOT NULL DEFAULT 60,
  deduct_from_hours boolean NOT NULL DEFAULT false,
  grace_minutes int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.break_policies TO anon, authenticated;
GRANT ALL ON public.break_policies TO service_role;
ALTER TABLE public.break_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on break_policies" ON public.break_policies FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER trg_break_policies_updated BEFORE UPDATE ON public.break_policies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ATTENDANCE EXTENSIONS
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS break_minutes int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_working_minutes int;
