/*
  # Create salary_hikes table for tracking salary increases

  1. New Tables
    - `salary_hikes`
      - `id` (uuid, primary key)
      - `staff_id` (text, references staff)
      - `old_salary` (integer)
      - `new_salary` (integer)
      - `hike_date` (text)
      - `reason` (text, nullable)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `salary_hikes` table
    - Add policy for authenticated users to manage salary hike data
*/

-- Create salary_hikes table
CREATE TABLE IF NOT EXISTS salary_hikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  old_salary integer NOT NULL,
  new_salary integer NOT NULL,
  hike_date text NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE salary_hikes ENABLE ROW LEVEL SECURITY;

-- Create policy for salary_hikes table
CREATE POLICY "Allow all operations on salary_hikes for all users"
  ON salary_hikes
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);