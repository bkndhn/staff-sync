import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  expenseClaimService,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseClaim,
} from '../../services/expenseClaimService';
import { customAlert, customConfirm } from '../CustomDialog';

interface Props {
  staffId: string;
  staffName?: string;
  location?: string;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const today = () => new Date().toISOString().slice(0, 10);

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-emerald-100 text-emerald-800',
};

export const ExpensesTab: React.FC<Props> = ({ staffId, staffName, location }) => {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimDate, setClaimDate] = useState(today());
  const [category, setCategory] = useState<ExpenseCategory>('travel');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    setClaims(await expenseClaimService.listByStaffId(staffId));
    setLoading(false);
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) { await customAlert('Enter an amount greater than zero.', 'Check amount'); return; }
    if (value > 100000) { await customAlert('Amount looks too high. Please contact your manager.', 'Check amount'); return; }
    if (!description.trim()) { await customAlert('Add a short description of the expense.', 'Description needed'); return; }
    setSaving(true);
    const ok = await expenseClaimService.create({
      staffId, staffName, location, claimDate, category, amount: value, description: description.trim(),
    });
    setSaving(false);
    if (!ok) { await customAlert('Could not submit the claim. Please try again.', 'Error'); return; }
    setAmount(''); setDescription(''); setClaimDate(today());
    await load();
  };

  const remove = async (c: ExpenseClaim) => {
    if (!(await customConfirm(`Withdraw the ${inr(c.amount)} claim?`, 'Withdraw claim'))) return;
    if (await expenseClaimService.remove(c.id)) await load();
  };

  const inputCls = 'w-full rounded-xl border border-[var(--glass-border)] bg-[var(--bg-card)] px-3 py-2 text-sm text-[var(--text-primary)]';

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
          <Receipt size={18} /> New expense claim
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-[var(--text-secondary)] space-y-1">
            <span>Date</span>
            <input type="date" max={today()} value={claimDate} onChange={e => setClaimDate(e.target.value)} className={inputCls} />
          </label>
          <label className="text-xs text-[var(--text-secondary)] space-y-1">
            <span>Category</span>
            <select value={category} onChange={e => setCategory(e.target.value as ExpenseCategory)} className={inputCls}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </label>
          <label className="text-xs text-[var(--text-secondary)] space-y-1">
            <span>Amount (₹)</span>
            <input type="number" inputMode="decimal" min="1" value={amount} onChange={e => setAmount(e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="text-xs text-[var(--text-secondary)] space-y-1 block">
          <span>Description</span>
          <textarea rows={2} maxLength={500} value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="e.g. Auto fare to supplier" />
        </label>
        <button type="submit" disabled={saving} className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Submit claim
        </button>
      </form>

      <div className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-2xl">
        <div className="px-4 py-3 font-semibold text-[var(--text-primary)] border-b border-[var(--glass-border)]">My claims</div>
        {loading ? (
          <div className="p-6 flex justify-center text-[var(--text-secondary)]"><Loader2 className="animate-spin" size={18} /></div>
        ) : claims.length === 0 ? (
          <div className="p-6 text-center text-sm text-[var(--text-secondary)]">No claims yet.</div>
        ) : (
          <div className="divide-y divide-[var(--glass-border)]">
            {claims.map(c => (
              <div key={c.id} className="p-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[var(--text-primary)]">
                      {EXPENSE_CATEGORIES.find(x => x.key === c.category)?.label || 'Other'}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${STATUS_STYLES[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">{new Date(c.claimDate).toLocaleDateString('en-IN')}</p>
                  {c.description && <p className="text-sm text-[var(--text-primary)] mt-1 break-words">{c.description}</p>}
                  {c.reviewNotes && <p className="text-xs text-[var(--text-secondary)] mt-1">Note: {c.reviewNotes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--text-primary)]">{inr(c.amount)}</span>
                  {c.status === 'pending' && (
                    <button type="button" onClick={() => remove(c)} aria-label="Withdraw claim" className="p-1.5 rounded-lg text-red-600 hover:bg-red-50">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExpensesTab;
