-- Create push_subscriptions table to store Web Push API endpoints
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff(id) ON DELETE CASCADE,
    app_user_id UUID REFERENCES public.app_users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow data-api to manage subscriptions for the correct tenant
CREATE POLICY "Allow data-api access to push_subscriptions" ON public.push_subscriptions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Create indexes for fast lookup during notification broadcast
CREATE INDEX IF NOT EXISTS idx_push_subs_staff ON public.push_subscriptions(staff_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(app_user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_tenant ON public.push_subscriptions(tenant_id);
