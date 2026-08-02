import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Users, Search, RefreshCw, Power, Trash2, KeyRound,
  LogOut, Eye, ShieldCheck, X, Pencil, BarChart3,
} from 'lucide-react';
import {
  superAdminService, impersonation, Tenant, TenantUser, PlatformOverview,
} from '../services/superAdminService';

interface Props {
  email: string;
  onLogout: () => void;
  /** Enter the normal app scoped to a client. */
  onViewAsClient: (tenant: Tenant) => void;
}

const blankTenant = {
  name: '', slug: '', plan: 'standard', staff_limit: 50, status: 'ACTIVE',
  contact_name: '', contact_email: '', contact_phone: '', notes: '',
  admin_email: '', admin_password: '', admin_full_name: '',
};

const ROLES = ['admin', 'manager', 'supervisor', 'statutory_admin', 'staff'];

const SuperAdminConsole: React.FC<Props> = ({ email, onLogout, onViewAsClient }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ ...blankTenant });
  const [userForm, setUserForm] = useState({ email: '', full_name: '', password: '', role: 'admin', location: '' });
  const [showUserForm, setShowUserForm] = useState(false);

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

  const loadUsers = useCallback(async (tenant: Tenant) => {
    setSelected(tenant);
    setUsers([]);
    try {
      setUsers(await superAdminService.listUsers(tenant.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

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
      if (selected?.id === t.id) setSelected(null);
      await load();
      flash('Client deleted');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true); setError('');
    try {
      await superAdminService.createUser({ ...userForm, tenant_id: selected.id });
      setUserForm({ email: '', full_name: '', password: '', role: 'admin', location: '' });
      setShowUserForm(false);
      await loadUsers(selected);
      await load();
      flash('User created');
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const resetPassword = async (u: TenantUser) => {
    const pwd = window.prompt(`New password for ${u.email} (min 8 chars):`);
    if (!pwd) return;
    try {
      await superAdminService.resetUserPassword(u.id, pwd);
      flash('Password reset — existing sessions signed out');
    } catch (e) { setError((e as Error).message); }
  };

  const toggleUser = async (u: TenantUser) => {
    try {
      await superAdminService.updateUser({ id: u.id, is_active: !u.is_active });
      if (selected) await loadUsers(selected);
    } catch (e) { setError((e as Error).message); }
  };

  const deleteUser = async (u: TenantUser) => {
    if (!window.confirm(`Delete user ${u.email}?`)) return;
    try {
      await superAdminService.deleteUser(u.id);
      if (selected) await loadUsers(selected);
      await load();
    } catch (e) { setError((e as Error).message); }
  };

  const viewAs = (t: Tenant) => {
    impersonation.set(t.id);
    onViewAsClient(t);
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
                    <button onClick={() => loadUsers(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      <Users size={14} /> Users
                    </button>
                    <button onClick={() => viewAs(t)} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                      <Eye size={14} /> View as client
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

                  {selected?.id === t.id && (
                    <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client users</p>
                        <div className="flex gap-2">
                          <button onClick={() => setShowUserForm(v => !v)} className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700">
                            {showUserForm ? 'Cancel' : 'Add user'}
                          </button>
                          <button onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">Close</button>
                        </div>
                      </div>

                      {showUserForm && (
                        <form onSubmit={submitUser} className="mb-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2">
                          <input required type="email" placeholder="Email" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} className={inputCls} />
                          <input required placeholder="Full name" value={userForm.full_name} onChange={e => setUserForm({ ...userForm, full_name: e.target.value })} className={inputCls} />
                          <input required type="password" minLength={8} placeholder="Password (min 8)" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} className={inputCls} />
                          <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} className={inputCls}>
                            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <input placeholder="Location (managers)" value={userForm.location} onChange={e => setUserForm({ ...userForm, location: e.target.value })} className={inputCls} />
                          <button disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">Create user</button>
                        </form>
                      )}

                      {users.length === 0 ? (
                        <p className="py-3 text-center text-xs text-slate-500">No users for this client yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {users.map(u => (
                            <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-slate-800">{u.full_name}</p>
                                <p className="truncate text-xs text-slate-500">{u.email} · {u.role}{u.location ? ` · ${u.location}` : ''}</p>
                              </div>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                {u.is_active ? 'active' : 'disabled'}
                              </span>
                              <button onClick={() => resetPassword(u)} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Reset password"><KeyRound size={14} /></button>
                              <button onClick={() => toggleUser(u)} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50" aria-label="Toggle active"><Power size={14} /></button>
                              <button onClick={() => deleteUser(u)} className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50" aria-label="Delete user"><Trash2 size={14} /></button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
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
