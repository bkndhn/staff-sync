import React, { useEffect, useState } from 'react';
import { IndianRupee, Plus, X, CheckCircle, Clock, XCircle } from 'lucide-react';
import {
  loanService, LoanRequest, LoanThresholds, DEFAULT_LOAN_THRESHOLDS, buildSchedule, emiAmount,
} from '../services/loanService';
import { dataApi } from '../lib/dataApi';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Props {
  staffId: string;
  staffName: string;
  location?: string;
  floor?: string;
}

const StaffLoanSection: React.FC<Props> = ({ staffId, staffName, location, floor }) => {
  const [loans, setLoans] = useState<LoanRequest[]>([]);
  const [deducted, setDeducted] = useState<Record<string, number>>({});
  const [thresholds, setThresholds] = useState<LoanThresholds>(DEFAULT_LOAN_THRESHOLDS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LoanRequest | null>(null);

  const now = new Date();
  const nextMonth = (now.getMonth() + 1) % 12;
  const nextYear = now.getFullYear() + (now.getMonth() === 11 ? 1 : 0);
  const [form, setForm] = useState({ amount: '', reason: '', emiMonths: 3, startMonth: nextMonth, startYear: nextYear });

  const load = async () => {
    setLoading(true);
    try {
      const [rows, t] = await Promise.all([loanService.getByStaff(staffId), loanService.getThresholds()]);
      setLoans(rows);
      setThresholds(t);
      if (rows.some(r => r.advanceEntryId)) {
        const { data } = await dataApi.from('advance_entries').select('id,total_deducted').eq('staff_id', staffId);
        const map: Record<string, number> = {};
        (data || []).forEach((r: any) => { map[r.id] = Number(r.total_deducted || 0); });
        setDeducted(map);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [staffId]);

  const amountNum = Number(form.amount) || 0;
  const levels = loanService.requiredLevels(amountNum, thresholds);

  const openEdit = (l: LoanRequest) => {
    setEditing(l);
    setForm({
      amount: String(l.amount),
      reason: l.reason,
      emiMonths: l.emiMonths,
      startMonth: l.startMonth,
      startYear: l.startYear,
    });
    setError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm({ amount: '', reason: '', emiMonths: 3, startMonth: nextMonth, startYear: nextYear });
  };

  const removeLoan = async (l: LoanRequest) => {
    if (!await customConfirm('Withdraw this loan request? This cannot be undone.')) return;
    try {
      await loanService.remove(l);
      await load();
    } catch (err: any) {
      customAlert(err?.message || 'Could not withdraw request');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (amountNum <= 0) { setError('Enter a valid amount'); return; }
    if (!form.reason.trim()) { setError('Please give a reason'); return; }
    setSubmitting(true);
    try {
      if (editing) {
        await loanService.updatePending(editing, {
          amount: amountNum,
          reason: form.reason.trim(),
          emiMonths: form.emiMonths,
          startMonth: form.startMonth,
          startYear: form.startYear,
        });
      } else {
        await loanService.create({
          staffId, staffName, location, floor,
          amount: amountNum,
          reason: form.reason.trim(),
          emiMonths: form.emiMonths,
          startMonth: form.startMonth,
          startYear: form.startYear,
        });
      }
      closeForm();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not submit request');
    } finally {
      setSubmitting(false);
    }
  };

  const totalPending = loans
    .filter(l => l.status === 'approved')
    .reduce((sum, l) => sum + Math.max(0, l.amount - (l.advanceEntryId ? (deducted[l.advanceEntryId] ?? 0) : 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] flex items-center gap-2">
            <IndianRupee size={18} className="text-indigo-500" /> Loans & Advances
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Outstanding balance {inr(totalPending)}</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Plus size={16} /> Request
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1].map(i => <div key={i} className="h-24 rounded-2xl bg-[var(--glass-bg)] animate-pulse" />)}</div>
      ) : loans.length === 0 ? (
        <div className="p-8 text-center rounded-2xl border border-dashed border-[var(--glass-border)] text-[var(--text-muted)] text-sm">
          No loan requests yet. Tap “Request” to apply.
        </div>
      ) : (
        <div className="space-y-3">
          {loans.map(l => {
            const paid = l.advanceEntryId ? (deducted[l.advanceEntryId] ?? 0) : 0;
            const schedule = buildSchedule(l, paid);
            return (
              <div key={l.id} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-card)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-[var(--text-primary)]">{inr(l.amount)}</div>
                    <p className="text-sm text-[var(--text-secondary)] break-words">{l.reason}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {l.emiMonths} months × {inr(emiAmount(l.amount, l.emiMonths))} from {MONTHS[l.startMonth]} {l.startYear}
                    </p>
                  </div>
                  {l.status === 'approved' ? (
                    <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 flex items-center gap-1"><CheckCircle size={12} /> Approved</span>
                  ) : l.status === 'pending' ? (
                    <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-600 flex items-center gap-1"><Clock size={12} /> Level {l.currentApprovalLevel}/{l.requiredApprovalLevels}</span>
                  ) : (
                    <span className="px-2 py-1 rounded-full text-[11px] font-semibold bg-red-500/15 text-red-600 flex items-center gap-1"><XCircle size={12} /> Rejected</span>
                  )}
                </div>

                {l.status === 'rejected' && l.rejectionReason && (
                  <p className="mt-2 text-xs text-red-600">Reason: {l.rejectionReason}</p>
                )}

                {l.status === 'approved' && (
                  <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)] mb-2">
                      <span>Deducted {inr(paid)}</span>
                      <span>Pending {inr(Math.max(0, l.amount - paid))}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--glass-bg)] overflow-hidden mb-3">
                      <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (paid / l.amount) * 100)}%` }} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {schedule.map((s, i) => (
                        <div key={i} className={`px-2.5 py-2 rounded-xl text-xs border ${s.paid ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-[var(--glass-border)] text-[var(--text-secondary)]'}`}>
                          <div className="font-semibold">{MONTHS[s.month]} {s.year}</div>
                          <div>{inr(s.amount)}{s.paid ? ' · deducted' : ' · pending'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={submit}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[var(--bg-card)] border border-[var(--glass-border)] p-5 space-y-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[var(--text-primary)]">New loan request</h4>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 rounded-xl text-[var(--text-muted)] hover:bg-[var(--glass-bg)]"><X size={16} /></button>
            </div>

            <label className="block">
              <span className="text-xs text-[var(--text-secondary)]">Amount (₹) — max {inr(thresholds.adminMaxAmount)}</span>
              <input type="number" inputMode="numeric" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="mt-1 w-full px-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
            </label>

            <label className="block">
              <span className="text-xs text-[var(--text-secondary)]">Reason</span>
              <textarea value={form.reason} rows={2}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                className="mt-1 w-full px-3 py-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Repay over</span>
                <select value={form.emiMonths}
                  onChange={e => setForm({ ...form, emiMonths: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                  {Array.from({ length: thresholds.maxEmiMonths }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-[var(--text-secondary)]">Start from</span>
                <select value={`${form.startMonth}-${form.startYear}`}
                  onChange={e => {
                    const [m, y] = e.target.value.split('-').map(Number);
                    setForm({ ...form, startMonth: m, startYear: y });
                  }}
                  className="mt-1 w-full px-3 py-3 rounded-xl bg-[var(--bg-card)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                  {Array.from({ length: 6 }, (_, i) => {
                    const m = (now.getMonth() + i) % 12;
                    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
                    return <option key={i} value={`${m}-${y}`}>{MONTHS[m]} {y}</option>;
                  })}
                </select>
              </label>
            </div>

            {amountNum > 0 && (
              <div className="p-3 rounded-xl bg-indigo-500/10 text-xs text-indigo-700 space-y-0.5">
                <div>Monthly deduction: <b>{inr(emiAmount(amountNum, form.emiMonths))}</b> for {form.emiMonths} month{form.emiMonths > 1 ? 's' : ''}</div>
                <div>Approval needed: {levels === 1 ? 'Manager' : 'Manager, then Admin'}</div>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)] font-medium">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-1 px-4 py-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50">
                {submitting ? 'Sending…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default StaffLoanSection;
