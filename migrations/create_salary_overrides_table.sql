CREATE TABLE IF NOT EXISTS salary_manual_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    basic_override INTEGER,
    incentive_override INTEGER,
    hra_override INTEGER,
    meal_allowance_override INTEGER,
    sunday_penalty_override INTEGER,
    salary_supplements_override JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(staff_id, month, year)
);

-- RLS Policies
ALTER TABLE salary_manual_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for authenticated users" ON salary_manual_overrides
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert access for authenticated users" ON salary_manual_overrides
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update access for authenticated users" ON salary_manual_overrides
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete access for authenticated users" ON salary_manual_overrides
    FOR DELETE USING (auth.role() = 'authenticated');
