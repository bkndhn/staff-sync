import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, Trash2, Copy, Check, Webhook, Send, Loader2, RefreshCw, Ban } from 'lucide-react';
import {
  apiAccessService,
  apiBaseUrl,
  AVAILABLE_SCOPES,
  WEBHOOK_EVENTS,
  type ApiKeyRow,
  type WebhookEndpointRow,
  type WebhookDeliveryRow,
} from '../services/apiAccessService';
import { customAlert, customConfirm } from './CustomDialog';
import { currentActor } from '../lib/currentActor';

const chip = 'px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20';

export const ApiAccessPanel: React.FC = () => {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const [keyName, setKeyName] = useState('');
  const [keyScopes, setKeyScopes] = useState<string[]>(['payroll:read', 'compliance:read']);
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState<string[]>([...WEBHOOK_EVENTS]);

  const load = useCallback(async () => {
    setLoading(true);
    const [k, e, d] = await Promise.all([
      apiAccessService.listKeys().catch(() => []),
      apiAccessService.listEndpoints().catch(() => []),
      apiAccessService.listDeliveries().catch(() => []),
    ]);
    setKeys(k); setEndpoints(e); setDeliveries(d);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* clipboard may be blocked */ }
  };

  const createKey = async () => {
    setBusy(true);
    try {
      const { secret } = await apiAccessService.createKey(keyName, keyScopes, currentActor().name);
      setFreshSecret(secret);
      setKeyName('');
      await load();
    } catch (err) {
      customAlert(err instanceof Error ? err.message : 'Could not create the key.');
    } finally { setBusy(false); }
  };

  const revoke = async (row: ApiKeyRow) => {
    if (!(await customConfirm(`Revoke "${row.name}"? Any system using it will stop working immediately.`))) return;
    await apiAccessService.revokeKey(row.id).catch(e => customAlert(e.message));
    load();
  };

  const addEndpoint = async () => {
    setBusy(true);
    try {
      await apiAccessService.createEndpoint(hookUrl, hookEvents);
      setHookUrl('');
      await load();
    } catch (err) {
      customAlert(err instanceof Error ? err.message : 'Could not save the endpoint.');
    } finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const { delivered } = await apiAccessService.dispatch('test.ping', { message: 'Hello from your payroll system' });
      customAlert(delivered > 0 ? `Test event delivered to ${delivered} endpoint(s).` : 'No active endpoint is subscribed to this event.');
      await load();
    } catch (err) {
      customAlert(err instanceof Error ? err.message : 'Could not send the test event.');
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Loader2 size={14} className="animate-spin" /> Loading integration settings…</div>;
  }

  return (
    <div className="space-y-5">
      {/* ── Base URL ─────────────────────────────────────────── */}
      <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-2">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">REST API base URL</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[11px] break-all text-[var(--text-secondary)]">{apiBaseUrl}</code>
          <button type="button" onClick={() => copy(apiBaseUrl, 'base')} className="p-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)]">
            {copied === 'base' ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          Send your key as <code>Authorization: Bearer &lt;key&gt;</code>. Endpoints:{' '}
          <code>/v1/payroll/runs</code>, <code>/v1/payroll/runs/&#123;id&#125;</code>, <code>/v1/staff</code>,{' '}
          <code>/v1/compliance/summary?month=&amp;year=</code>, <code>/v1/payslips?month=&amp;year=</code>.
        </p>
      </div>

      {/* ── API keys ─────────────────────────────────────────── */}
      <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><KeyRound size={14} className="text-amber-500" /> API keys</h3>

        {freshSecret && (
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-1">
            <p className="text-[11px] text-emerald-500 font-medium">Copy this key now — it is never shown again.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] break-all text-[var(--text-primary)]">{freshSecret}</code>
              <button type="button" onClick={() => copy(freshSecret, 'secret')} className="p-1.5 rounded-lg border border-emerald-500/40 text-emerald-500">
                {copied === 'secret' ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button type="button" onClick={() => setFreshSecret(null)} className="text-[11px] text-[var(--text-muted)] px-2">Done</button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            placeholder="Key name (e.g. Tally integration)"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] bg-transparent text-[var(--text-primary)]"
          />
          <button type="button" disabled={busy} onClick={createKey} className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white flex items-center gap-1.5 disabled:opacity-60">
            <Plus size={14} /> Create key
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_SCOPES.map(scope => (
            <label key={scope} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={keyScopes.includes(scope)}
                onChange={e => setKeyScopes(prev => e.target.checked ? [...prev, scope] : prev.filter(s => s !== scope))}
              />
              {scope}
            </label>
          ))}
        </div>

        <ul className="divide-y divide-[var(--glass-border)]">
          {keys.length === 0 && <li className="text-[11px] text-[var(--text-muted)] py-2">No keys yet.</li>}
          {keys.map(k => (
            <li key={k.id} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-[var(--text-primary)] flex items-center gap-2">
                  {k.name}
                  {k.revoked_at && <span className="text-[10px] text-rose-500">revoked</span>}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] break-all">
                  {k.key_prefix}…· {k.scopes?.join(', ')} · {k.last_used_at ? `last used ${new Date(k.last_used_at).toLocaleDateString()}` : 'never used'}
                </div>
              </div>
              {!k.revoked_at && (
                <button type="button" onClick={() => revoke(k)} className="p-1.5 rounded-lg border border-[var(--glass-border)] text-rose-500" title="Revoke">
                  <Ban size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={async () => { await apiAccessService.deleteKey(k.id).catch(() => undefined); load(); }}
                className="p-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--text-muted)]"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Webhooks ─────────────────────────────────────────── */}
      <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2"><Webhook size={14} className="text-violet-500" /> Webhook endpoints</h3>
          <div className="flex gap-1.5">
            <button type="button" onClick={sendTest} disabled={busy} className="px-2.5 py-1 text-[11px] rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] flex items-center gap-1">
              <Send size={12} /> Send test
            </button>
            <button type="button" onClick={load} className="p-1.5 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)]"><RefreshCw size={13} /></button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={hookUrl}
            onChange={e => setHookUrl(e.target.value)}
            placeholder="https://your-system.example.com/hooks/payroll"
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--glass-border)] bg-transparent text-[var(--text-primary)]"
          />
          <button type="button" disabled={busy} onClick={addEndpoint} className="px-3 py-2 text-xs font-medium rounded-lg bg-violet-600 text-white flex items-center gap-1.5 disabled:opacity-60">
            <Plus size={14} /> Add endpoint
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {WEBHOOK_EVENTS.map(ev => (
            <label key={ev} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={hookEvents.includes(ev)}
                onChange={e => setHookEvents(prev => e.target.checked ? [...prev, ev] : prev.filter(x => x !== ev))}
              />
              {ev}
            </label>
          ))}
        </div>

        <ul className="divide-y divide-[var(--glass-border)]">
          {endpoints.length === 0 && <li className="text-[11px] text-[var(--text-muted)] py-2">No endpoints configured.</li>}
          {endpoints.map(ep => (
            <li key={ep.id} className="py-2 space-y-1">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-[var(--text-primary)] break-all">{ep.url}</div>
                  <div className="flex flex-wrap gap-1 mt-1">{(ep.events || []).map(ev => <span key={ev} className={chip}>{ev}</span>)}</div>
                </div>
                <button
                  type="button"
                  onClick={async () => { await apiAccessService.updateEndpoint(ep.id, { is_active: !ep.is_active }).catch(() => undefined); load(); }}
                  className={`px-2 py-1 text-[11px] rounded-lg border ${ep.is_active ? 'border-emerald-500/40 text-emerald-500' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
                >
                  {ep.is_active ? 'Active' : 'Paused'}
                </button>
                <button
                  type="button"
                  onClick={async () => { await apiAccessService.deleteEndpoint(ep.id).catch(() => undefined); load(); }}
                  className="p-1.5 rounded-lg border border-[var(--glass-border)] text-rose-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[10px] text-[var(--text-muted)] break-all">signing secret: {ep.secret}</code>
                <button type="button" onClick={() => copy(ep.secret, ep.id)} className="text-[var(--text-muted)]">
                  {copied === ep.id ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* ── Delivery log ─────────────────────────────────────── */}
      <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Recent deliveries</h3>
        {deliveries.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">Nothing sent yet.</p>
        ) : (
          <ul className="space-y-1">
            {deliveries.map(d => (
              <li key={d.id} className="flex items-center gap-2 text-[11px]">
                <span className={`w-2 h-2 rounded-full ${d.ok ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="text-[var(--text-primary)]">{d.event}</span>
                <span className="text-[var(--text-muted)]">{d.status_code ?? d.error ?? ''}</span>
                <span className="ml-auto text-[var(--text-muted)]">{new Date(d.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ApiAccessPanel;
