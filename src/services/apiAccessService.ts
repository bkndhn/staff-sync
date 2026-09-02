import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface WebhookEndpointRow {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  description: string | null;
  last_delivery_at: string | null;
  failure_count: number;
  created_at: string;
}

export interface WebhookDeliveryRow {
  id: string;
  event: string;
  ok: boolean;
  status_code: number | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export const WEBHOOK_EVENTS = [
  'payroll.run.generated',
  'payroll.run.approved',
  'compliance.export.generated',
  'payslip.issued',
] as const;

export const AVAILABLE_SCOPES = ['payroll:read', 'compliance:read', 'staff:read', 'payslips:read'] as const;

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nsmppwnpdxomjmgrtqka.supabase.co';

export const apiBaseUrl = `${SUPABASE_URL}/functions/v1/public-api`;

const randomToken = (bytes = 24): string => {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

const sessionToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
};

export const apiAccessService = {
  async listKeys(): Promise<ApiKeyRow[]> {
    const { data } = await dataApi.from('api_keys').select('*').order('created_at', { ascending: false });
    return (data as ApiKeyRow[]) || [];
  },

  /** Creates a key and returns the plaintext value — shown to the admin exactly once. */
  async createKey(name: string, scopes: string[], createdBy?: string): Promise<{ row: ApiKeyRow; secret: string }> {
    const secret = `sk_live_${randomToken(24)}`;
    const keyHash = await sha256(secret);
    const { data, error } = await dataApi.from('api_keys').insert({
      name: name.trim() || 'Untitled key',
      key_prefix: secret.slice(0, 16),
      key_hash: keyHash,
      scopes: scopes.length ? scopes : ['payroll:read', 'compliance:read'],
      created_by: createdBy || null,
    }).select().single();
    if (error) throw new Error(error.message || 'Could not create the API key.');
    return { row: data as ApiKeyRow, secret };
  },

  async revokeKey(id: string): Promise<void> {
    const { error } = await dataApi.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteKey(id: string): Promise<void> {
    const { error } = await dataApi.from('api_keys').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listEndpoints(): Promise<WebhookEndpointRow[]> {
    const { data } = await dataApi.from('webhook_endpoints').select('*').order('created_at', { ascending: false });
    return (data as WebhookEndpointRow[]) || [];
  },

  async createEndpoint(url: string, events: string[], description?: string): Promise<WebhookEndpointRow> {
    if (!/^https:\/\/.+/i.test(url)) throw new Error('The endpoint URL must start with https://');
    const { data, error } = await dataApi.from('webhook_endpoints').insert({
      url: url.trim(),
      secret: `whsec_${randomToken(24)}`,
      events: events.length ? events : [...WEBHOOK_EVENTS],
      description: description?.trim() || null,
    }).select().single();
    if (error) throw new Error(error.message || 'Could not save the endpoint.');
    return data as WebhookEndpointRow;
  },

  async updateEndpoint(id: string, patch: Partial<Pick<WebhookEndpointRow, 'url' | 'events' | 'is_active' | 'description'>>): Promise<void> {
    const { error } = await dataApi.from('webhook_endpoints').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },

  async deleteEndpoint(id: string): Promise<void> {
    const { error } = await dataApi.from('webhook_endpoints').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async listDeliveries(limit = 20): Promise<WebhookDeliveryRow[]> {
    const { data } = await dataApi
      .from('webhook_deliveries')
      .select('id, event, ok, status_code, error, duration_ms, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data as WebhookDeliveryRow[]) || [];
  },

  /** Fire an event to every subscribed endpoint (also used by the "Send test" button). */
  async dispatch(event: string, payload: Record<string, unknown>): Promise<{ delivered: number }> {
    const token = await sessionToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/webhook-dispatch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-session-token': token, Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ event, payload }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'Could not send the webhook.');
    return { delivered: Number(body?.delivered) || 0 };
  },
};
