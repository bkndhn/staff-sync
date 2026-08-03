-- Create workflow_configs table to define approval hierarchies
CREATE TABLE IF NOT EXISTS public.workflow_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'leave_request' CHECK (entity_type IN ('leave_request', 'expense_claim')),
    levels JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of objects e.g. [{level: 1, role: 'manager', location: 'Branch A'}, {level: 2, role: 'admin'}]
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enhance leave_requests for multi-level tracking
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS current_approval_level INT DEFAULT 1;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS required_approval_levels INT DEFAULT 1;
ALTER TABLE public.leave_requests ADD COLUMN IF NOT EXISTS approval_history JSONB DEFAULT '[]'::jsonb;

-- RLS
ALTER TABLE public.workflow_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow data-api access to workflow_configs" ON public.workflow_configs
    FOR ALL USING (true) WITH CHECK (true);
