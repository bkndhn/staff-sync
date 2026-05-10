-- Create locations table
CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing anon access as per current app structure)
CREATE POLICY "Enable read access for all users" ON locations
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON locations
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON locations
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON locations
    FOR DELETE USING (true);

-- Insert default locations if they don't exist
INSERT INTO locations (name)
VALUES 
  ('Big Shop'),
  ('Small Shop'),
  ('Godown')
ON CONFLICT (name) DO NOTHING;
