import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Check, X, Loader2, IndianRupee, Filter, BadgeCheck } from 'lucide-react';
import {
  expenseClaimService,
  EXPENSE_CATEGORIES,
  type ExpenseClaim,
  type ExpenseStatus,
} from '../services/expenseClaimService';
import { customAlert, customConfirm } from './CustomDialog';

interface Props {
  userRole?: string;
  userName?: string;
  userLocation?: string;
  allowedStaffIds?: string[];
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

const STATUS_STYLES: Record<ExpenseStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-700 border-red-200',
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const FILTERS: { key: ExpenseStatus | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const ExpenseClaims: React.FC<Props> = ({ userRole, userName, userLocation, allowedStaffIds }) => {
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ExpenseStatus | 'all'>('pending');

  const canReview = userRole === 'admin' || userRole === 'manager' || userRole === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await expenseClaimService.listAll();
    setClaims(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    let rows = claims;
    if (userLocation) rows = rows.filter(c => !c.location || c.location === userLocation);
    if (allowedStaffIds && allowedStaffIds.length > 0) {
      const set = new Set(allowedStaffIds);
      rows = rows.filter(c => set.has(c.staffId));
    }
    if (filter !== 'all') rows = rows.filter(c => c.status === filter);
    return rows;
  }, [claims, filter, userLocation, allowedStaffIds]);

  const totals = useMemo(() => {
    const sum = (s: ExpenseStatus) =>
      claims.filter(c => c.status === s).reduce((t, c) => t + c.amount, 0);
    return { pending: sum('pending'), approved: sum('approved'), paid: sum('paid') };
  }, [claims]);

  const review = async (claim: ExpenseClaim, status: 'approved' | 'rejected') => {
    const label = status === 'approved' ? 'Approve' : 'Reject';
    const ok = await customConfirm(
      `${label} the ${inr(claim.amount)} claim from ${claim.staffName || 'this employee'}?`,
      `${label} claim`,
    );
    if (!ok) return;
    setBusyId(claim.id);
    const done = await expenseClaimService.review(claim.id, status, userName || 'Reviewer');
    setBusyId(null);
    if (!done) { await customAlert('Could not update the claim. Please try again.', 'Error'); return; }
    await load();
  };

  const markPaid = async (claim: ExpenseClaim) => {
    const now = new Date();
    const ok = await customConfirm(
      `Mark ${inr(claim.amount)} as reimbursed to ${claim.staffName || 'this employee'} in this month's payout?`,
      'Mark as paid',
    );
    if (!ok) return;
    setBusyId(claim.id);
    const done = await expenseClaimService.markPaid(claim.id, now.getMonth(), now.getFullYear());
    setBusyId(null);
    if (!done) { await customAlert('Could not update the claim. Please try again.', 'Error'); return; }
    await load();
  };

  const categoryLabel = (key: string) =>
    EXPENSE_CATEGORIES.find(c => c.key === key)?.label || 'Other';

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-4 md:p-6 text-white">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-2 rounded-lg"><Receipt size={22} /></div>
          <div>
            <h1 className="text-lg md:text-xl font-bold">Expense Claims</h1>
            <p className="text-white/80 text-xs md:text-sm">
              Review staff reimbursement requests and release them with the monthly payout.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { label: 'Awaiting review', value: totals.pending, tone: 'text-amber-600' },
          { label: 'Approved, not paid', value: totals.approved, tone: 'text-blue-600' },
          { label: 'Reimbursed', value: totals.paid, tone: 'text-emerald-600' },
        ].map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-medium text-gray-500">{card.label}</p>
            <p className={`text-xl font-bold mt-1 ${card.tone}`}>{inr(card.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-gray-100">
          <Filter size={15} className="text-gray-400" />
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center text-gray-500 gap-2">
            <Loader2 className="animate-spin" size={18} /> Loading claims…
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">No claims in this list.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {visible.map(claim => (
              <div key={claim.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800 text-sm">
                      {claim.staffName || 'Employee'}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold ${STATUS_STYLES[claim.status]}`}>
                      {claim.status}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {categoryLabel(claim.category)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(claim.claimDate).toLocaleDateString('en-IN')}
                    {claim.location ? ` · ${claim.location}` : ''}
                  </p>
                  {claim.description && (
                    <p className="text-sm text-gray-700 mt-1 break-words">{claim.description}</p>
                  )}
                  {claim.reviewedBy && (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Reviewed by {claim.reviewedBy}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 md:justify-end">
                  <span className="flex items-center font-bold text-gray-800">
                    <IndianRupee size={14} />{Math.round(claim.amount).toLocaleString('en-IN')}
                  </span>

                  {canReview && claim.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        disabled={busyId === claim.id}
                        onClick={() => review(claim, 'approved')}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyId === claim.id}
                        onClick={() => review(claim, 'rejected')}
                        className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-xs font-semibold hover:bg-red-200 disabled:opacity-50 flex items-center gap-1"
                      >
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}

                  {canReview && claim.status === 'approved' && (
                    <button
                      type="button"
                      disabled={busyId === claim.id}
                      onClick={() => markPaid(claim)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      <BadgeCheck size={14} /> Mark paid
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

export default ExpenseClaims;
