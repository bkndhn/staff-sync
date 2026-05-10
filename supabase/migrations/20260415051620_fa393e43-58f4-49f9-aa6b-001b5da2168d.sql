
CREATE TABLE public.advance_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  entry_date DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  purpose TEXT,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.advance_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on advance_entries for all users"
ON public.advance_entries FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX idx_advance_entries_staff_month ON public.advance_entries(staff_id, month, year);
CREATE INDEX idx_advance_entries_date ON public.advance_entries(entry_date);
