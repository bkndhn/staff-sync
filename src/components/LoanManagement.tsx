import React, { useEffect, useMemo, useState } from 'react';
import {
  IndianRupee, CheckCircle, XCircle, Clock, Settings2, Search, RefreshCw, CalendarDays, User,
  Pencil, Trash2,
} from 'lucide-react';
import {
  loanService, LoanRequest, LoanThresholds, DEFAULT_LOAN_THRESHOLDS, buildSchedule, emiAmount,
} from '../services/loanService';
import { dataApi } from '../lib/dataApi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Props {
  userRole: string;
  userName: string;
  userLocation?: string;
}

const LoanManagement: React.FC<Props> = ({ userRole, userName, userLocation }) => {
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [deducted, setDeducted] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [search, setSearch] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [thresholds, setThresholds] = useState<LoanThresholds>(DEFAULT_LOAN_THRESHOLDS);
  const [expanded, setExpanded] = useState<string | null>(null);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [dateFilter, setDateFilter] = useState<string>(todayStr);
  const [editing, setEditing] = useState<LoanRequest | null>(null);
  const [editForm, setEditForm] = useState({ amount: 0, reason: '', emiMonths: 1, startMonth: 0, startYear: 2026 });

  const isAdmin = userRole === 'admin' || userRole === 'statutory_admin';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, t] = await Promise.all([loanService.getAll(), loanService.getThresholds()]);
      setLoans(rows);
      setThresholds(t);
      const ids = rows.map(r => r.advanceEntryId).filter(Boolean) as string[];
      if (ids.length) {
        const { data } = await dataApi.from('advance_entries').select('id,total_deducted');
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { map[r.id] = Number(r.total_deducted || 0); });
        setDeducted(map);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load loan requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return loans.filter(l => {
      if (tab === 'pending' && l.status !== 'pending') return false;
      if (tab === 'approved' && l.status !== 'approved') return false;
      if (tab === 'rejected' && !['rejected', 'cancelled'].includes(l.status)) return false;
      if (q && !(`${l.staffName || ''} ${l.reason}`.toLowerCase().includes(q))) return false;
      if (dateFilter && (l.createdAt || '').slice(0, 10) !== dateFilter) return false;
      return true;
    });
  }, [loans, tab, search, dateFilter]);

  const canAct = (l: LoanRequest) => l.status === 'pending' && (isAdmin || l.currentApprovalLevel === 1);

  const act = async (l: LoanRequest, approve: boolean) => {
    let comment = '';
    if (!approve) {
      const r = window.prompt('Reason for rejection?');
      if (!r) return;
      comment = r;
    }
    setBusyId(l.id);
    setError(null);
    try {
      if (approve) await loanService.approve(l, { name: userName, role: userRole });
      else await loanService.reject(l, { name: userName, role: userRole }, comment);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const saveConfig = async () => {
    await loanService.saveThresholds(thresholds);
    setShowConfig(false);
  };

  const openEdit = (l: LoanRequest) => {
    setEditing(l);
    setEditForm({ amount: l.amount, reason: l.reason, emiMonths: l.emiMonths, startMonth: l.startMonth, startYear: l.startYear });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusyId(editing.id);
    setError(null);
    try {
      await loanService.updatePending(editing, editForm);
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not update the request');
    } finally {
      setBusyId(null);
    }
  };

  const removeLoan = async (l: LoanRequest) => {
    if (!window.confirm(`Delete the ₹${l.amount.toLocaleString('en-IN')} loan request from ${l.staffName || 'this staff member'}?`)) return;
    setBusyId(l.id);
    setError(null);
    try {
      await loanService.remove(l);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not delete the request');
    } finally {
      setBusyId(null);
    }
  };

  const statusChip = (l: LoanRequest) => {
    if (l.status === 'approved') return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600">Approved</span>;
    if (l.status === 'pending') return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600">Level {l.currentApprovalLevel} of {l.requiredApprovalLevels}</span>;
    return <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-600">Rejected</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
          <IndianRupee size={22} className="text-blue-600" /> Loan Requests
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]" aria-label="Refresh">
            <RefreshCw size={16} />
          </button>
          {isAdmin && (
            <button onClick={() => setShowConfig(true)} className="px-3 py-2 rounded-xl border border-[var(--glass-border)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--glass-bg)] flex items-center gap-1.5">
              <Settings2 size={15} /> Rules
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search staff or reason"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-sm text-[var(--text-primary)]"
            aria-label="Filter by request date"
          />
          <button
            onClick={() => setDateFilter(dateFilter ? '' : todayStr)}
            className="px-3 py-2.5 rounded-xl border border-[var(--glass-border)] text-sm text-[var(--text-secondary)] whitespace-nowrap"
          >
            {dateFilter ? 'All dates' : 'Today'}
          </button>
        </div>
        <div className="flex rounded-xl border border-[var(--glass-border)] overflow-hidden">
          {(['pending', 'approved', 'rejected'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 sm:flex-none px-4 py-2.5 text-sm font-medium capitalize transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--glass-bg)]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="p-3 rounded-xl bg-red-500/10 text-red-600 text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-[var(--glass-bg)] animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center rounded-2xl border border-dashed border-[var(--glass-border)] text-[var(--text-muted)]">
          <Clock size={28} className="mx-auto mb-2 opacity-60" />
          No {tab} loan requests.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => {
            const paid = l.advanceEntryId ? (deducted[l.advanceEntryId] ?? 0) : 0;
            const schedule = buildSchedule(l, paid);
            return (
              <div key={l.id} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-card)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User size={15} className="text-[var(--text-muted)]" />
                      <span className="font-semibold text-[var(--text-primary)]">{l.staffName || 'Staff'}</span>
                      {statusChip(l)}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mt-1 break-words">{l.reason}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1 flex items-center gap-1">
                      <CalendarDays size={12} /> {l.emiMonths} EMI × {inr(emiAmount(l.amount, l.emiMonths))} from {MONTHS[l.startMonth]} {l.startYear}
                      {l.location ? ` · ${l.location}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-[var(--text-primary)]">{inr(l.amount)}</div>
                    {l.status === 'approved' && (
                      <div className="text-xs text-[var(--text-muted)]">
                        Paid {inr(paid)} · Pending {inr(Math.max(0, l.amount - paid))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {canAct(l) && (
                    <>
                      <button
                        disabled={busyId === l.id}
                        onClick={() => act(l, true)}
                        className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <CheckCircle size={15} /> Approve{l.currentApprovalLevel < l.requiredApprovalLevels ? ' (Level 1)' : ''}
                      </button>
                      <button
                        disabled={busyId === l.id}
                        onClick={() => act(l, false)}
                        className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle size={15} /> Reject
                      </button>
                    </>
                  )}
                  {l.status === 'pending' && (isAdmin || canAct(l)) && (
                    <>
                      <button
                        disabled={busyId === l.id}
                        onClick={() => openEdit(l)}
                        className="px-3 py-2 rounded-xl border border-[var(--glass-border)] text-sm text-[var(--text-secondary)] flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        disabled={busyId === l.id}
                        onClick={() => removeLoan(l)}
                        className="px-3 py-2 rounded-xl bg-red-500/10 text-red-600 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 size={15} /> Delete
                      </button>
                    </>
                  )}
                  {l.status === 'pending' && !canAct(l) && (
                    <span className="text-xs text-[var(--text-muted)] self-center">Waiting for admin approval</span>
                  )}
                  <button
                    onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                    className="px-3 py-2 rounded-xl border border-[var(--glass-border)] text-sm text-[var(--text-secondary)]"
                  >
                    {expanded === l.id ? 'Hide' : 'Details'}
                  </button>
                </div>

                {expanded === l.id && (
                  <div className="mt-3 pt-3 border-t border-[var(--glass-border)] space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">EMI schedule</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {schedule.map((s, i) => (
                          <div key={i} className={`px-2.5 py-2 rounded-xl text-xs border ${s.paid ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-[var(--glass-border)] text-[var(--text-secondary)]'}`}>
                            <div className="font-semibold">{MONTHS[s.month]} {s.year}</div>
                            <div>{inr(s.amount)}{s.paid ? ' · paid' : ''}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {l.approvalHistory.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-[var(--text-muted)] mb-1.5">Approval trail</p>
                        <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                          {l.approvalHistory.map((h, i) => (
                            <li key={i}>
                              L{h.level} · {h.action} by {h.by} ({h.role}) · {new Date(h.at).toLocaleDateString('en-IN')}
                              {h.comment ? ` — ${h.comment}` : ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[var(--text-primary)] mb-3">Edit loan request</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Amount (₹)</span>
                <input type="number" value={editForm.amount}
                  onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Reason</span>
                <input value={editForm.reason}
                  onChange={e => setEditForm({ ...editForm, reason: e.target.value })}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">EMI months</span>
                  <input type="number" min={1} value={editForm.emiMonths}
                    onChange={e => setEditForm({ ...editForm, emiMonths: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Start month</span>
                  <select value={editForm.startMonth}
                    onChange={e => setEditForm({ ...editForm, startMonth: Number(e.target.value) })}
                    className="mt-1 w-full px-2 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                    {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Year</span>
                  <input type="number" value={editForm.startYear}
                    onChange={e => setEditForm({ ...editForm, startYear: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
                </label>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEditing(null)} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={saveEdit} disabled={busyId === editing.id} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}

      {showConfig && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowConfig(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-[var(--text-primary)] mb-3">Loan approval rules</h3>
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Manager can approve up to (₹)</span>
                <input type="number" value={thresholds.managerMaxAmount}
                  onChange={e => setThresholds({ ...thresholds, managerMaxAmount: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Maximum loan amount (₹) — needs admin approval</span>
                <input type="number" value={thresholds.adminMaxAmount}
                  onChange={e => setThresholds({ ...thresholds, adminMaxAmount: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Maximum EMI months</span>
                <input type="number" value={thresholds.maxEmiMonths}
                  onChange={e => setThresholds({ ...thresholds, maxEmiMonths: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowConfig(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)]">Cancel</button>
              <button onClick={saveConfig} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanManagement;
