// Client (tenant) control-plane API for the super admin console.
// Every call is authorised server-side by the `super-admin` edge function.

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://nsmppwnpdxomjmgrtqka.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbXBwd25wZHhvbWptZ3J0cWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NDM3NjksImV4cCI6MjA2NzExOTc2OX0.gVzJ4uPAmFT5yngvdcFsHXHH1cUL-nIq0e71Gx8ALOk';
const FN_URL = `${SUPABASE_URL}/functions/v1/super-admin`;

export interface Tenant {
  id: string;
  name: string;
  slug?: string | null;
  status: string;
  staff_limit: number;
  plan?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  staff_portal_enabled?: boolean;
  created_at?: string;
  staff_count?: number;
  active_staff_count?: number;
  user_count?: number;
}

export interface TenantUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  location: string | null;
  floor?: string | null;
  is_active: boolean;
  last_login?: string | null;
  tenant_id: string | null;
  created_at?: string;
}

export interface PlatformOverview {
  tenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalSeats: number;
  staff: number;
  users: number;
  attendanceToday: number;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let token = localStorage.getItem('sessionToken');
  if (!token) {
    try {
      const raw = localStorage.getItem('staffManagementLogin');
      if (raw) token = JSON.parse(raw)?.sessionToken || null;
    } catch { /* ignore */ }
  }
  if (!token) throw new Error('Not signed in');

  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'x-session-token': token,
    },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json.data as T;
}

export const superAdminService = {
  overview: () => call<PlatformOverview>('overview'),
  listTenants: () => call<Tenant[]>('list_tenants'),
  createTenant: (payload: Record<string, unknown>) =>
    call<{ tenant: Tenant; adminUser: TenantUser | null }>('create_tenant', payload),
  updateTenant: (payload: Record<string, unknown>) => call<Tenant>('update_tenant', payload),
  deleteTenant: (id: string) => call<{ deleted: string }>('delete_tenant', { id, confirm: true }),
  tenantStats: (id: string) => call<Record<string, number>>('tenant_stats', { id }),

};

/** Kept so any stale impersonation state from earlier builds is cleared. */
export const impersonation = {
  get: () => {
    try { return localStorage.getItem('impersonateTenantId') || ''; } catch { return ''; }
  },
  clear: () => {
    try { localStorage.removeItem('impersonateTenantId'); } catch { /* ignore */ }
  },
};
