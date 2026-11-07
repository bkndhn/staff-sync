import React, { useCallback, useEffect, useState } from 'react';
import { Calculator, Check, X, Loader2 } from 'lucide-react';
import type { Staff } from '../types';
import { taxDeclarationService, currentFy, type TaxDeclaration } from '../services/taxDeclarationService';
import { LIMITS } from '../utils/taxDeclarations';
import { customAlert } from './CustomDialog';

const inr = (v?: number) => `Rs. ${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

/** Managers verify employee tax declarations; approved ones drive payroll TDS. */
export const TaxDeclarationReview: React.FC<{ staff: Staff[]; reviewer?: string; onChanged?: () => void }> = ({ staff, reviewer, onChanged }) => {
  const fy = currentFy();
  const [rows, setRows] = useState<TaxDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const names = new Map(staff.map(s => [s.id, s.name]));

  const load = useCallback(() => {
    setLoading(true);
    taxDeclarationService.list(fy).then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, [fy]);
  useEffect(load, [load]);

  const decide = async (d: TaxDeclaration, status: 'Approved' | 'Rejected') => {
    const notes = status === 'Rejected' ? (window.prompt('Reason for rejection (shown to the employee)') ?? '') : '';
    if (status === 'Rejected' && !notes.trim()) return;
    setBusy(d.id!);
    try {
      await taxDeclarationService.review(d.id!, status, reviewer || 'manager', notes);
      await taxDeclarationService.primeForPayroll(staff, fy);
      load(); onChanged?.();
    } catch (e) {
      customAlert(e instanceof Error ? e.message : 'Could not update.');
    } finally { setBusy(null); }
  };

  const order = { Submitted: 0, Rejected: 1, Approved: 2 } as Record<string, number>;
  const sorted = [...rows].sort((a, b) => (order[a.status || ''] ?? 3) - (order[b.status || ''] ?? 3));

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Calculator size={16} className="text-blue-600" />
        <h3 className="text-sm font-semibold text-gray-800">Employee tax declarations · FY {fy}</h3>
        <span className="ml-auto text-xs text-gray-500">{rows.filter(r => r.status === 'Submitted').length} waiting</span>
      </div>
      {loading ? (
        <div className="p-4 text-xs text-gray-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
      ) : sorted.length === 0 ? (
        <p className="p-4 text-xs text-gray-500">No declarations yet. Staff submit them from the Tax Declaration tab in their portal.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sorted.map(d => {
            const i = d.items;
            return (
              <li key={d.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-800">
                    {names.get(d.staffId) || 'Former staff'} · <span className="text-gray-500">{d.regime === 'old' ? 'Old regime' : 'New regime'}</span>
                  </div>
                  {d.regime === 'old' && (
                    <div className="text-[11px] text-gray-500">
                      80C {inr(Math.min(Number(i.sec80c) || 0, LIMITS.sec80c))} · 80D {inr(i.sec80d)} · NPS {inr(i.sec80ccd1b)} · Home loan {inr(i.sec24b)} · 80E {inr(i.sec80e)} · 80G {inr(i.sec80g)} · Rent {inr(i.rentPaid)}{i.metroCity ? ' (metro)' : ''}
                    </div>
                  )}
                  {d.reviewNotes && <div className="text-[11px] text-gray-500">Note: {d.reviewNotes}</div>}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${d.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : d.status === 'Rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                  {d.status === 'Submitted' ? 'Waiting' : d.status}
                </span>
                {d.status !== 'Approved' && (
                  <button disabled={busy === d.id} onClick={() => decide(d, 'Approved')} className="px-2.5 py-1.5 text-xs rounded-lg bg-emerald-600 text-white flex items-center gap-1 disabled:opacity-50"><Check size={12} /> Approve</button>
                )}
                {d.status !== 'Rejected' && (
                  <button disabled={busy === d.id} onClick={() => decide(d, 'Rejected')} className="px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 text-gray-700 flex items-center gap-1 disabled:opacity-50"><X size={12} /> Reject</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-gray-100">
        Approved declarations are used for TDS from the next payroll calculation. Check proofs (receipts, policy copies) before approving.
      </p>
    </div>
  );
};
