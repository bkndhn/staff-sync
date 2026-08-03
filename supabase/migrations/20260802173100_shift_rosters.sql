-- Create shift_rosters table
CREATE TABLE IF NOT EXISTS public.shift_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift_key TEXT NOT NULL, -- e.g. 'Morning', 'Night'
    location TEXT NOT NULL,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, date) -- A staff member can only have one shift per day
);

-- RLS
ALTER TABLE public.shift_rosters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow data-api access to shift_rosters" ON public.shift_rosters
    FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shift_rosters_staff ON public.shift_rosters(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_rosters_date ON public.shift_rosters(date);
CREATE INDEX IF NOT EXISTS idx_shift_rosters_location ON public.shift_rosters(location);
