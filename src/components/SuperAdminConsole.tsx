import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, RefreshCw, Power, Trash2,
  LogOut, ShieldCheck, X, Pencil, BarChart3, Smartphone,
} from 'lucide-react';
import {
  superAdminService, Tenant, PlatformOverview,
} from '../services/superAdminService';

interface Props {
  email: string;
  onLogout: () => void;
}

const blankTenant = {
  name: '', slug: '', plan: 'standard', staff_limit: 50, status: 'ACTIVE',
  contact_name: '', contact_email: '', contact_phone: '', notes: '',
  staff_portal_enabled: true,
  admin_email: '', admin_password: '', admin_full_name: '',
};

const SuperAdminConsole: React.FC<Props> = ({ email, onLogout }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ ...blankTenant });

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(''), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [t, o] = await Promise.all([
        superAdminService.listTenants(),
        superAdminService.overview(),
      ]);
      setTenants(t);
      setOverview(o);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter(t =>
      [t.name, t.slug, t.contact_email, t.contact_name, t.plan]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(q)));
  }, [tenants, search]);

  const openCreate = () => { setEditing(null); setForm({ ...blankTenant }); setShowForm(true); };
  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({
      ...blankTenant,
      name: t.name, slug: t.slug || '', plan: t.plan || 'standard',
      staff_limit: t.staff_limit, status: t.status,
      staff_portal_enabled: t.staff_portal_enabled !== false,
      contact_name: t.contact_name || '', contact_email: t.contact_email || '',
      contact_phone: t.contact_phone || '', notes: t.notes || '',
    });
    setShowForm(true);
  };

  const submitTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (editing) {
        await superAdminService.updateTenant({ id: editing.id, ...form });
        flash('Client updated');
      } else {
        await superAdminService.createTenant(form);
        flash('Client onboarded');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (t: Tenant) => {
    setBusy(true);
    try {
      await superAdminService.updateTenant({ id: t.id, status: t.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' });
      await load();
      flash(t.status === 'ACTIVE' ? 'Client suspended' : 'Client activated');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const removeTenant = async (t: Tenant) => {
    const typed = window.prompt(`This permanently deletes ALL data for "${t.name}".\nType the client name to confirm:`);
    if (typed !== t.name) return;
    setBusy(true);
    try {
      await superAdminService.deleteTenant(t.id);
      await load();
      flash('Client deleted');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const toggleStaffPortal = async (t: Tenant) => {
    setBusy(true);
    try {
      const next = !(t.staff_portal_enabled !== false);
      await superAdminService.updateTenant({ id: t.id, staff_portal_enabled: next });
      await load();
      flash(next ? 'Staff portal enabled' : 'Staff portal disabled');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const stat = (label: string, value: React.ReactNode) => (
    <div className="rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-blue-700">{value}</p>
    </div>
  );

  const field = (label: string, node: React.ReactNode) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {node}
    </label>
  );

  const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-blue-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-slate-900">Super Admin</h1>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <button onClick={load} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onLogout} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>
        )}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stat('Clients', overview?.tenants ?? '—')}
          {stat('Active', overview?.activeTenants ?? '—')}
          {stat('Total staff', overview?.staff ?? '—')}
          {stat('Marked today', overview?.attendanceToday ?? '—')}
        </section>

        <section className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search clients…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <Plus size={16} /> Onboard client
          </button>
        </section>

        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
            <Building2 className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-sm text-slate-500">No clients yet. Onboard your first client.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map(t => {
              const usage = t.staff_limit ? Math.min(100, Math.round(((t.staff_count ?? 0) / t.staff_limit) * 100)) : 0;
              return (
                <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {t.status}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{t.plan || 'standard'}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {t.contact_name || '—'} · {t.contact_email || 'no contact email'} · {t.user_count ?? 0} users
                      </p>
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                          <span>Staff {t.staff_count ?? 0} / {t.staff_limit}</span>
                          <span>{usage}%</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${usage >= 90 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${usage}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => toggleStaffPortal(t)} disabled={busy} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${t.staff_portal_enabled !== false ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <Smartphone size={14} /> Staff portal: {t.staff_portal_enabled !== false ? 'On' : 'Off'}
                    </button>
                    <button onClick={() => openEdit(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={() => toggleStatus(t)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                      <Power size={14} /> {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                    </button>
                    <button onClick={() => removeTenant(t)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>

                </li>
              );
            })}
          </ul>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400">
          <BarChart3 size={12} /> {overview?.totalSeats ?? 0} seats provisioned across {overview?.tenants ?? 0} clients
        </p>
      </main>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">{editing ? 'Edit client' : 'Onboard new client'}</h2>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={submitTenant} className="grid gap-3 sm:grid-cols-2">
              {field('Client name *', <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />)}
              {field('Short code', <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto from name" className={inputCls} />)}
              {field('Staff limit', <input type="number" min={1} value={form.staff_limit} onChange={e => setForm({ ...form, staff_limit: Number(e.target.value) })} className={inputCls} />)}
              {field('Plan', (
                <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className={inputCls}>
                  <option value="trial">trial</option>
                  <option value="standard">standard</option>
                  <option value="pro">pro</option>
                  <option value="enterprise">enterprise</option>
                </select>
              ))}
              {field('Contact person', <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className={inputCls} />)}
              {field('Contact email', <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className={inputCls} />)}
              {field('Contact phone', <input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} className={inputCls} />)}
              {field('Status', (
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              ))}
              {field('Staff portal access', (
                <select value={form.staff_portal_enabled ? 'on' : 'off'} onChange={e => setForm({ ...form, staff_portal_enabled: e.target.value === 'on' })} className={inputCls}>
                  <option value="on">Enabled</option>
                  <option value="off">Disabled</option>
                </select>
              ))}
              <div className="sm:col-span-2">
                {field('Notes', <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />)}
              </div>

              {!editing && (
                <>
                  <div className="sm:col-span-2 pt-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">First admin login (optional)</p>
                  </div>
                  {field('Admin email', <input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} className={inputCls} />)}
                  {field('Admin name', <input value={form.admin_full_name} onChange={e => setForm({ ...form, admin_full_name: e.target.value })} className={inputCls} />)}
                  <div className="sm:col-span-2">
                    {field('Admin password (min 8)', <input type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} className={inputCls} />)}
                  </div>
                </>
              )}

              <div className="sm:col-span-2 flex gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700">Cancel</button>
                <button disabled={busy} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? 'Saving…' : editing ? 'Save changes' : 'Create client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminConsole;
