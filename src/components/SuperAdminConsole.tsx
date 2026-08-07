import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Plus, Search, RefreshCw, Power, Trash2,
  LogOut, ShieldCheck, X, Pencil, BarChart3, Smartphone,
  Settings as SettingsIcon, AlertCircle, Eye, EyeOff, ShieldAlert,
  Users, ChevronDown, ChevronRight, Mail, UserCheck, UserX, Clock, Activity, Heart
} from 'lucide-react';
import {
  superAdminService, Tenant, TenantUser, PlatformOverview,
} from '../services/superAdminService';
import { customConfirm } from './CustomDialog';
import { User } from '../types';
import { userService } from '../services/userService';
import { AuditLogViewer } from './AuditLogViewer';
import TenantStatusBanner from './TenantStatusBanner';
import { PlatformHealth } from './PlatformHealth';

interface Props {
  user: User;
  onLogout: () => void;
  onUpdateUser: (u: User) => void;
}

const blankTenant = {
  name: '', slug: '', plan: 'standard', staff_limit: 50, status: 'ACTIVE',
  location_limit: 10, sub_user_limit: 5,
  contact_name: '', contact_email: '', contact_phone: '', notes: '',
  staff_portal_enabled: true,
  admin_email: '', admin_password: '', admin_full_name: '',
};

const SuperAdminConsole: React.FC<Props> = ({ user, onLogout, onUpdateUser }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [overview, setOverview] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState({ currentPassword: '', newEmail: user.email, newPassword: '', confirmPassword: '' });
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [form, setForm] = useState({ ...blankTenant });
  const [wizardStep, setWizardStep] = useState(1);
  const [activeTab, setActiveTab] = useState<'Clients' | 'Audit Logs' | 'Platform Health' | 'Permissions'>('Clients');

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

  const openCreate = () => { setEditing(null); setForm({ ...blankTenant }); setWizardStep(1); setShowForm(true); };
  const openEdit = (t: Tenant) => {
    setEditing(t);
    setForm({
      ...blankTenant,
      name: t.name, slug: t.slug || '', plan: t.plan || 'standard',
      staff_limit: t.staff_limit, status: t.status,
      location_limit: (t as any).location_limit ?? 10,
      sub_user_limit: (t as any).sub_user_limit ?? 5,
      staff_portal_enabled: t.staff_portal_enabled !== false,
      contact_name: t.contact_name || '', contact_email: t.contact_email || '',
      contact_phone: t.contact_phone || '', notes: t.notes || '',
    });
    setWizardStep(1);
    setShowForm(true);
  };

  const submitTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (editing) {
        await superAdminService.updateTenant({ id: editing.id, ...form });
        flash('Client updated successfully');
      } else {
        await superAdminService.createTenant(form);
        flash('Client onboarded successfully');
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
    const typed = window.prompt(
      `⚠️ PERMANENT CLIENT DELETION WARNING ⚠️\n\nThis will PERMANENTLY DELETE ALL DATA for "${t.name}".\n\nType DELETE ALL to confirm:`
    );
    if (!typed || typed.trim().toUpperCase() !== 'DELETE ALL') { flash('Deletion cancelled.'); return; }
    setBusy(true);
    try {
      await superAdminService.deleteTenant(t.id);
      await load();
      flash(`Client "${t.name}" permanently deleted.`);
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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileForm.currentPassword) { setProfileError('Current password is required'); return; }
    if (profileForm.newPassword && profileForm.newPassword !== profileForm.confirmPassword) {
      setProfileError('New passwords do not match'); return;
    }
    if (profileForm.newPassword && profileForm.newPassword.length < 8) {
      setProfileError('New password must be at least 8 characters'); return;
    }
    setProfileBusy(true); setProfileError(''); setProfileSuccess('');
    try {
      const validation = await userService.validateLogin(user.email, profileForm.currentPassword);
      if (!validation) throw new Error('Incorrect current password');
      if (!user.id) throw new Error('User ID missing from session');
      const updatePayload: any = {};
      if (profileForm.newEmail !== user.email) updatePayload.email = profileForm.newEmail;
      if (profileForm.newPassword) updatePayload.password = profileForm.newPassword;
      if (Object.keys(updatePayload).length > 0) {
        const updatedUser = await userService.updateUser(user.id, updatePayload);
        if (!updatedUser) throw new Error('Failed to update profile');
        onUpdateUser({ ...user, email: profileForm.newEmail });
        setProfileSuccess('Profile updated successfully!');
        setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
      } else {
        setProfileError('No changes to save');
      }
    } catch (err: any) {
      setProfileError(err.message || 'Error updating profile');
    } finally {
      setProfileBusy(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const field = (label: string, node: React.ReactNode) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-slate-600">{label}</span>
      {node}
    </label>
  );

  const StatCard = ({ label, value, color }: { label: string; value: React.ReactNode; color: string }) => (
    <div className={`rounded-xl border p-3 shadow-sm bg-white ${color}`}>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
  );

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      admin: 'bg-blue-50 text-blue-700',
      manager: 'bg-purple-50 text-purple-700',
      supervisor: 'bg-orange-50 text-orange-700',
      statutory_admin: 'bg-teal-50 text-teal-700',
    };
    return map[role] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <ShieldCheck size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold text-slate-900">Super Admin Console</h1>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button onClick={() => { setProfileError(''); setProfileSuccess(''); setProfileForm(p => ({ ...p, newEmail: user.email })); setShowProfile(true); }}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Profile Settings">
            <SettingsIcon size={16} />
          </button>
          <button onClick={load} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setActiveTab(activeTab === 'Clients' ? 'Audit Logs' : 'Clients')}
            className={`rounded-lg border p-2 ${activeTab === 'Audit Logs' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Audit Logs">
            <ShieldAlert size={16} />
          </button>
          <button
            onClick={() => setActiveTab('Platform Health')}
            className={`rounded-lg border p-2 ${activeTab === 'Platform Health' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            title="Platform Health">
            <Activity size={16} />
          </button>
          <button onClick={async () => {
            if (await customConfirm("Log out of Super Admin console?")) onLogout();
          }} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" title="Sign out">
            <LogOut size={16} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-slate-100 bg-white">
          {(['Clients', 'Audit Logs', 'Platform Health'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-semibold transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}>
              {tab}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 pb-24">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError('')}><X size={14} /></button>
          </div>
        )}
        {notice && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 font-medium">{notice}</div>
        )}

        {activeTab === 'Clients' ? (
          <>
            {/* Stats */}
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Total Clients" value={overview?.tenants ?? '—'} color="border-blue-100" />
              <StatCard label="Active" value={overview?.activeTenants ?? '—'} color="border-emerald-100" />
              <StatCard label="Total Staff" value={overview?.totalStaff ?? '—'} color="border-purple-100" />
              <StatCard label="Total Seats" value={overview?.totalSeats ?? '—'} color="border-amber-100" />
            </section>

            {/* Search + Add */}
            <section className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients by name, email, plan…"
                  className={`${inputCls} pl-9`} />
              </div>
              <button onClick={openCreate}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
                <Plus size={16} /> Add Client
              </button>
            </section>

            {/* Clients list */}
            {loading ? (
              <div className="space-y-3">
                {[0, 1].map(i => <div key={i} className="h-32 animate-pulse rounded-xl bg-white border border-slate-200" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center">
                <Building2 className="mx-auto mb-3 text-slate-300" size={36} />
                <p className="text-sm font-medium text-slate-500">No clients yet.</p>
                <p className="text-xs text-slate-400 mt-1">Click "Add Client" to onboard your first client.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(t => {
                  const isExpanded = expandedTenant === t.id;
                  const adminUsers = (t.users || []).filter(u => u.role === 'admin');
                  const subUsers = (t.users || []).filter(u => u.role !== 'admin');

                  return (
                    <div key={t.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      {(t.status !== 'ACTIVE' || t.staff_portal_enabled === false) && (
                        <TenantStatusBanner tenant={t} role="super_admin" onEnableStaffPortal={() => toggleStaffPortal(t)} />
                      )}

                      {/* Client header */}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white font-bold text-lg shadow-sm">
                            {t.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-bold text-slate-900 text-base">{t.name}</h3>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${t.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {t.status}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 uppercase">
                                {t.plan || 'standard'}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-3">
                              {t.contact_email && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <Mail size={11} /> {t.contact_email}
                                </p>
                              )}
                              {t.contact_phone && (
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                  <Smartphone size={11} /> {t.contact_phone}
                                </p>
                              )}
                            </div>
                            {/* Stats row */}
                            <div className="mt-2 flex flex-wrap gap-3">
                              <span className="flex items-center gap-1 text-xs text-slate-600">
                                <Users size={12} className="text-blue-500" />
                                <span className="font-semibold">{t.staff_count ?? 0}</span> staff
                                <span className="text-slate-400">/ {t.staff_limit} limit</span>
                              </span>
                              <span className="flex items-center gap-1 text-xs text-slate-600">
                                <UserCheck size={12} className="text-purple-500" />
                                <span className="font-semibold">{t.user_count ?? 0}</span> admin users
                              </span>
                              {t.created_at && (
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Clock size={11} />
                                  Since {new Date(t.created_at).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Admin users inline */}
                        {adminUsers.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {adminUsers.map(u => (
                              <div key={u.id} className="flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-100 px-2.5 py-1">
                                <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="text-xs font-medium text-blue-800">{u.email}</span>
                                <span className="text-[10px] text-blue-500 font-semibold uppercase bg-blue-100 px-1 py-0.5 rounded">Admin</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sub users expand toggle */}
                        {subUsers.length > 0 && (
                          <button onClick={() => setExpandedTenant(isExpanded ? null : t.id)}
                            className="mt-2 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
                            {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            {subUsers.length} sub-user{subUsers.length !== 1 ? 's' : ''} (managers, supervisors)
                          </button>
                        )}

                        {/* Sub users expanded */}
                        {isExpanded && subUsers.length > 0 && (
                          <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-slate-100">
                            {subUsers.map(u => (
                              <div key={u.id} className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                <span className="text-xs text-slate-700">{u.email}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge(u.role)}`}>{u.role}</span>
                                {u.location && <span className="text-[10px] text-slate-400">{u.location}</span>}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                          <button onClick={() => toggleStaffPortal(t)} disabled={busy}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${t.staff_portal_enabled !== false ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                            <Smartphone size={13} /> Staff Portal: {t.staff_portal_enabled !== false ? 'On' : 'Off'}
                          </button>
                          <button onClick={() => openEdit(t)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                            <Pencil size={13} /> Edit
                          </button>
                          <button onClick={() => toggleStatus(t)} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            <Power size={13} /> {t.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                          </button>
                          <button onClick={() => removeTenant(t)} disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="flex items-center justify-center gap-1.5 pt-2 text-[11px] text-slate-400">
              <BarChart3 size={12} /> {overview?.totalSeats ?? 0} seats · {overview?.totalStaff ?? 0} staff · {overview?.tenants ?? 0} clients
            </p>
          </>
        ) : activeTab === 'Audit Logs' ? (
          <AuditLogViewer currentUserEmail={user.email} />
        ) : (
          <PlatformHealth />
        )}

      </main>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-50 border-b border-slate-100 p-4 px-6 flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Building2 size={20} className="text-blue-600" />
                {editing ? 'Edit Client' : 'Add New Client'}
              </h2>
              <button onClick={() => setShowForm(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full z-0"></div>
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-blue-600 rounded-full z-0 transition-all duration-300" style={{ width: `${((wizardStep - 1) / (editing ? 2 : 3)) * 100}%` }}></div>
                  {[1, 2, 3, ...(editing ? [] : [4])].map((step) => (
                    <div key={step} className="relative z-10 flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors duration-300 ${wizardStep >= step ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-white border-2 border-slate-200 text-slate-400'}`}>
                        {step < wizardStep ? <ShieldCheck size={16} /> : step}
                      </div>
                      <span className={`text-[10px] mt-1.5 font-medium absolute -bottom-4 whitespace-nowrap ${wizardStep >= step ? 'text-blue-700' : 'text-slate-400'}`}>
                        {step === 1 ? 'Basic Info' : step === 2 ? 'Plan & Features' : step === 3 ? 'Contact' : 'First Admin'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 pt-8">
                <form id="onboarding-form" onSubmit={submitTenant} onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && (e.target as HTMLElement).tagName !== 'BUTTON') {
                    e.preventDefault();
                  }
                }}>
                  {wizardStep === 1 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Step 1: Basic Information</h3>
                      {field('Client / Business Name *', <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. SHABNAM Stores" />)}
                      {field('Short Code (optional)', <input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="auto-generated if blank" className={inputCls} />)}
                      {field('Account Status', (
                        <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputCls}>
                          <option value="ACTIVE">ACTIVE — Allow Login</option>
                          <option value="SUSPENDED">SUSPENDED — Block Login</option>
                        </select>
                      ))}
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Step 2: Plan & Limits</h3>
                      <div className="grid grid-cols-2 gap-4">
                        {field('Subscription Plan', (
                          <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} className={inputCls}>
                            <option value="trial">Trial</option>
                            <option value="standard">Standard</option>
                            <option value="pro">Pro</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        ))}
                        {field('Staff Seat Limit', <input type="number" min={1} value={form.staff_limit} onChange={e => setForm({ ...form, staff_limit: Number(e.target.value) })} className={inputCls} />)}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {field('Max Branchs', (
                          <div>
                            <input type="number" min={1} max={100} value={(form as any).location_limit} onChange={e => setForm({ ...form, location_limit: Number(e.target.value) } as any)} className={inputCls} />
                            <p className="mt-1 text-[11px] text-slate-400">Branches/outlets this client can create</p>
                          </div>
                        ))}
                        {field('Max Sub-Users', (
                          <div>
                            <input type="number" min={0} max={100} value={(form as any).sub_user_limit} onChange={e => setForm({ ...form, sub_user_limit: Number(e.target.value) } as any)} className={inputCls} />
                            <p className="mt-1 text-[11px] text-slate-400">Managers + supervisors (not admin)</p>
                          </div>
                        ))}
                      </div>
                      <div className="p-4 border border-blue-100 rounded-xl bg-blue-50/50">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input type="checkbox" checked={form.staff_portal_enabled} onChange={e => setForm({ ...form, staff_portal_enabled: e.target.checked })} className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500" />
                          <div>
                            <span className="block font-medium text-slate-800 text-sm">Enable Staff Portal Access</span>
                            <span className="block text-xs text-slate-500 mt-0.5">Staff can log in to view their own attendance and salary slips.</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-100">Step 3: Point of Contact</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {field('Contact Name', <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} className={inputCls} placeholder="Primary contact person" />)}
                        {field('Contact Phone', <input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} className={inputCls} placeholder="+91 98765 43210" />)}
                      </div>
                      {field('Contact Email', <input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} className={inputCls} placeholder="billing or ops email" />)}
                      {field('Internal Notes', <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} placeholder="Any notes visible only to super admins" />)}
                    </div>
                  )}

                  {wizardStep === 4 && !editing && (
                    <div className="space-y-4">
                      <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-4">
                        <h3 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2"><ShieldCheck size={16} className="text-indigo-600" /> Create Client Administrator</h3>
                        <p className="text-xs text-indigo-700">This account can log in and manage all staff data for this client. Skip if creating the admin separately.</p>
                      </div>
                      {field('Admin Full Name', <input value={form.admin_full_name} onChange={e => setForm({ ...form, admin_full_name: e.target.value })} className={inputCls} placeholder="e.g. Bakrudheen K" />)}
                      {field('Admin Email', <input type="email" value={form.admin_email} onChange={e => setForm({ ...form, admin_email: e.target.value })} className={inputCls} placeholder="admin@example.com" />)}
                      {field('Admin Password (min 8 chars)', <input type="password" value={form.admin_password} onChange={e => setForm({ ...form, admin_password: e.target.value })} className={inputCls} placeholder="Temporary password" minLength={8} />)}
                    </div>
                  )}
                </form>
              </div>
            </div>

            {error && (
              <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}

            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <button type="button" onClick={() => setWizardStep(Math.max(1, wizardStep - 1))}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${wizardStep === 1 ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 shadow-sm'}`}
                disabled={wizardStep === 1}>
                Back
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800">Cancel</button>
                {wizardStep < (editing ? 3 : 4) ? (
                  <button type="button"
                    onClick={() => {
                      if (wizardStep === 1 && !form.name.trim()) return flash('Client Name is required');
                      setWizardStep(wizardStep + 1);
                    }}
                    style={{ color: '#ffffff', backgroundColor: '#1e293b' }}
                    className="px-6 py-2 text-sm font-semibold rounded-lg hover:opacity-90 shadow-sm transition-opacity">
                    Next →
                  </button>
                ) : (
                  <button type="button"
                    disabled={busy || !form.name.trim()}
                    onClick={(e) => { e.preventDefault(); submitTenant(e as any); }}
                    style={{ color: '#ffffff', backgroundColor: busy ? '#93c5fd' : '#2563eb' }}
                    className="px-6 py-2 text-sm font-semibold rounded-lg hover:opacity-90 shadow-sm transition-opacity disabled:opacity-50 flex items-center gap-2">
                    {busy ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                    {editing ? 'Save Changes' : 'Complete Onboarding'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Profile Settings</h2>
              <button onClick={() => setShowProfile(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              {field('Email Address', <input required type="email" value={profileForm.newEmail} onChange={e => setProfileForm({ ...profileForm, newEmail: e.target.value })} className={inputCls} />)}
              <div className="pt-2">
                <p className="mb-2 text-sm font-medium text-slate-700">Change Password <span className="text-xs text-slate-500 font-normal">(leave blank to keep current)</span></p>
                <div className="space-y-3">
                  <div className="relative">
                    <input type={showPwd.new ? "text" : "password"} placeholder="New Password" value={profileForm.newPassword} onChange={e => setProfileForm({ ...profileForm, newPassword: e.target.value })} className={`${inputCls} pr-10`} />
                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, new: !p.new }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="relative">
                    <input type={showPwd.confirm ? "text" : "password"} placeholder="Confirm New Password" value={profileForm.confirmPassword} onChange={e => setProfileForm({ ...profileForm, confirmPassword: e.target.value })} className={`${inputCls} pr-10`} />
                    <button type="button" onClick={() => setShowPwd(p => ({ ...p, confirm: !p.confirm }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="mb-2 text-sm font-medium text-amber-900">Current Password Required</p>
                <div className="relative">
                  <input required type={showPwd.current ? "text" : "password"} placeholder="Enter current password to save" value={profileForm.currentPassword} onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })} className={`${inputCls} pr-10`} />
                  <button type="button" onClick={() => setShowPwd(p => ({ ...p, current: !p.current }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPwd.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {profileError && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={14} className="mt-0.5 shrink-0" /><span>{profileError}</span></div>}
              {profileSuccess && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{profileSuccess}</div>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowProfile(false)} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
                <button disabled={profileBusy} className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {profileBusy ? 'Saving…' : 'Save Changes'}
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
