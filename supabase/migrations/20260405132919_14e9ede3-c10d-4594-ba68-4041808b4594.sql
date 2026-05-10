
-- Add bank details and payment mode to staff
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS bank_account_number text DEFAULT NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS ifsc_code text DEFAULT NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS bank_name text DEFAULT NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT 'cash';

-- Add per-staff hike scheduling
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS next_hike_date date DEFAULT NULL;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS hike_interval_months integer DEFAULT NULL;

-- Create app_settings table for global settings like default hike interval
CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to app_settings" ON public.app_settings
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Insert default hike interval (12 months)
INSERT INTO public.app_settings (key, value) VALUES ('default_hike_interval_months', '12')
ON CONFLICT (key) DO NOTHING;
