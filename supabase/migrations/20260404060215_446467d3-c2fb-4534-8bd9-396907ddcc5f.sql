
-- Create floors table
CREATE TABLE public.floors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_name text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read floors" ON public.floors FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated read floors" ON public.floors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert floors" ON public.floors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update floors" ON public.floors FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete floors" ON public.floors FOR DELETE TO authenticated USING (true);

-- Create designations table
CREATE TABLE public.designations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    display_name text NOT NULL,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read designations" ON public.designations FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated read designations" ON public.designations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert designations" ON public.designations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update designations" ON public.designations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated delete designations" ON public.designations FOR DELETE TO authenticated USING (true);

-- Add floor and designation columns to staff table
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS floor text;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS designation text;
