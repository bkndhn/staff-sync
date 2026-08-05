-- Migration: World-Class Biometric Device Sync & Health Monitoring
-- Description: Adds device_status table for hardware heartbeats and functions/indexes for rapid deduplication.

-- 1. Create device_status table for biometric hardware health monitoring
CREATE TABLE IF NOT EXISTS public.device_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    device_name TEXT,
    location TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'online', -- 'online', 'offline', 'warning'
    ip_address TEXT,
    total_punches_today INTEGER DEFAULT 0,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_device_per_tenant UNIQUE (device_id, tenant_id)
);

-- Index for fast lookup on device_status
CREATE INDEX IF NOT EXISTS idx_device_status_tenant ON public.device_status(tenant_id, device_id);

-- 2. Index on punch_events for fast deduplication & min/max IN/OUT queries
CREATE INDEX IF NOT EXISTS idx_punch_events_staff_date ON public.punch_events(staff_id, date, event_time);
CREATE INDEX IF NOT EXISTS idx_punch_events_tenant_date ON public.punch_events(tenant_id, date);

-- 3. Enable RLS on device_status
ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view device status for their tenant
CREATE POLICY device_status_select_policy ON public.device_status
    FOR SELECT TO authenticated
    USING (tenant_id IS NULL OR tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- Allow service_role / anon function full access
CREATE POLICY device_status_service_policy ON public.device_status
    FOR ALL TO service_role USING (true) WITH CHECK (true);
