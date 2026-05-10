/*
  # Staff Management System Database Schema

  1. New Tables
    - `staff`
      - `id` (uuid, primary key)
      - `name` (text)
      - `location` (text)
      - `type` (text)
      - `experience` (text)
      - `basic_salary` (integer)
      - `incentive` (integer)
      - `hra` (integer)
      - `total_salary` (integer)
      - `joined_date` (text)
      - `is_active` (boolean)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `attendance`
      - `id` (uuid, primary key)
      - `staff_id` (text)
      - `date` (date)
      - `status` (text)
      - `attendance_value` (decimal)
      - `is_sunday` (boolean)
      - `is_part_time` (boolean)
      - `staff_name` (text, nullable)
      - `shift` (text, nullable)
      - `location` (text, nullable)
      - `created_at` (timestamp)

    - `advances`
      - `id` (uuid, primary key)
      - `staff_id` (text)
      - `month` (integer)
      - `year` (integer)
      - `old_advance` (integer)
      - `current_advance` (integer)
      - `deduction` (integer)
      - `new_advance` (integer)
      - `notes` (text, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `old_staff_records`
      - `id` (uuid, primary key)
      - `original_staff_id` (text)
      - `name` (text)
      - `location` (text)
      - `type` (text)
      - `experience` (text)
      - `basic_salary` (integer)
      - `incentive` (integer)
      - `hra` (integer)
      - `total_salary` (integer)
      - `joined_date` (text)
      - `left_date` (text)
      - `reason` (text)
      - `total_advance_outstanding` (integer)
      - `last_advance_data` (jsonb, nullable)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their data
*/

-- Create staff table
CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL CHECK (location IN ('Big Shop', 'Small Shop', 'Godown')),
  type text NOT NULL CHECK (type IN ('full-time', 'part-time')),
  experience text NOT NULL,
  basic_salary integer NOT NULL DEFAULT 15000,
  incentive integer NOT NULL DEFAULT 10000,
  hra integer NOT NULL DEFAULT 0,
  total_salary integer NOT NULL,
  joined_date text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create attendance table
CREATE TABLE IF NOT EXISTS attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  date date NOT NULL,
  status text NOT NULL CHECK (status IN ('Present', 'Half Day', 'Absent')),
  attendance_value decimal(3,1) NOT NULL,
  is_sunday boolean DEFAULT false,
  is_part_time boolean DEFAULT false,
  staff_name text,
  shift text CHECK (shift IN ('Morning', 'Evening', 'Both')),
  location text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, date, is_part_time)
);

-- Create advances table
CREATE TABLE IF NOT EXISTS advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id text NOT NULL,
  month integer NOT NULL CHECK (month >= 0 AND month <= 11),
  year integer NOT NULL,
  old_advance integer NOT NULL DEFAULT 0,
  current_advance integer NOT NULL DEFAULT 0,
  deduction integer NOT NULL DEFAULT 0,
  new_advance integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(staff_id, month, year)
);

-- Create old_staff_records table
CREATE TABLE IF NOT EXISTS old_staff_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_staff_id text NOT NULL,
  name text NOT NULL,
  location text NOT NULL,
  type text NOT NULL,
  experience text NOT NULL,
  basic_salary integer NOT NULL,
  incentive integer NOT NULL,
  hra integer NOT NULL,
  total_salary integer NOT NULL,
  joined_date text NOT NULL,
  left_date text NOT NULL,
  reason text NOT NULL,
  total_advance_outstanding integer NOT NULL DEFAULT 0,
  last_advance_data jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE old_staff_records ENABLE ROW LEVEL SECURITY;

-- Create policies for staff table
CREATE POLICY "Allow all operations on staff"
  ON staff
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for attendance table
CREATE POLICY "Allow all operations on attendance"
  ON attendance
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for advances table
CREATE POLICY "Allow all operations on advances"
  ON advances
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policies for old_staff_records table
CREATE POLICY "Allow all operations on old_staff_records"
  ON old_staff_records
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert initial staff data
INSERT INTO staff (name, location, type, experience, basic_salary, incentive, hra, total_salary, joined_date, is_active) VALUES
('SULTAN', 'Big Shop', 'full-time', '0y 0m', 15000, 10000, 0, 25000, '7/2/2025', true),
('IRFAN', 'Godown', 'full-time', '12y 3m', 15000, 10000, 5000, 30000, '4/1/2013', true),
('SHAHUL PPT', 'Godown', 'full-time', '8y 2m', 15000, 9000, 5000, 29000, '5/18/2017', true),
('IMRAN', 'Small Shop', 'full-time', '12y 3m', 15000, 10000, 5000, 30000, '4/1/2013', true),
('BAKRUDHEEN', 'Godown', 'full-time', '7y 9m', 15000, 10000, 5000, 30000, '10/30/2017', true)
ON CONFLICT DO NOTHING;