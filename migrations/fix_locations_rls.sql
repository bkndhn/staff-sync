-- Enable RLS
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for anon (public) and authenticated users
CREATE POLICY "Allow public access to locations"
ON locations
FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);
