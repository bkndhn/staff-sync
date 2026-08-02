CREATE TABLE audit_logs (
    id text primary key,
    tenant_id uuid references tenants(id) on delete cascade not null,
    action text not null,
    staff_id uuid,
    staff_name text,
    details text not null,
    performed_by text not null,
    timestamp timestamptz default now() not null,
    changes jsonb,
    before jsonb,
    after jsonb
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their tenant"
    ON audit_logs FOR SELECT
    USING (
        tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
    );

CREATE POLICY "Users can insert audit logs for their tenant"
    ON audit_logs FOR INSERT
    WITH CHECK (
        tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
    );
