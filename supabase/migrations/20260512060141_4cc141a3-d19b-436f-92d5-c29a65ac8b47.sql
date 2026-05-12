CREATE TABLE IF NOT EXISTS public.punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  staff_name text,
  location text,
  date date NOT NULL,
  event_time text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('in','out')),
  source text NOT NULL DEFAULT 'face',
  match_distance numeric,
  liveness_score numeric,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_events_staff_date ON public.punch_events(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_punch_events_date ON public.punch_events(date);

ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to punch_events"
  ON public.punch_events
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);