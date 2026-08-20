-- Create table for tracking blacklisted devices (e.g. from device resets)
CREATE TABLE IF NOT EXISTS public.blacklisted_devices (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
    device_fingerprint text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(staff_id, device_fingerprint)
);

-- RLS setup
ALTER TABLE public.blacklisted_devices ENABLE ROW LEVEL SECURITY;

-- Allow reading for admins of the tenant
CREATE POLICY "Admins can view blacklisted devices for their tenant's staff"
ON public.blacklisted_devices FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = public.blacklisted_devices.staff_id
        AND s.tenant_id = (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid())
    )
);

-- Allow inserting for admins of the tenant
CREATE POLICY "Admins can insert blacklisted devices for their tenant's staff"
ON public.blacklisted_devices FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.id = staff_id
        AND s.tenant_id = (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid())
    )
);
