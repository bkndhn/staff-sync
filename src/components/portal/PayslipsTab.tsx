import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, Receipt, ShieldCheck, RefreshCw, Ban } from 'lucide-react';
import { payslipLinkService, isLinkActive, type PayslipLinkRow, type PayslipSnapshot } from '../../services/payslipLinkService';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inr = (v: number) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;

const downloadPayslipPdf = async (snap: PayslipSnapshot) => {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const period = `${MONTHS[snap.month] || ''} ${snap.year}`;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`Payslip — ${period}`, 14, 18);
  doc.setFontSize(11);
  doc.text(`${snap.staffName}${snap.employeeCode ? ` (${snap.employeeCode})` : ''}`, 14, 27);
  doc.text(`${snap.designation || ''}${snap.location ? ` · ${snap.location}` : ''}`, 14, 34);
  autoTable(doc, {
    startY: 42,
    head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
    body: Array.from({ length: Math.max(snap.earnings.length, snap.deductions.length) }, (_, i) => [
      snap.earnings[i]?.label || '',
      snap.earnings[i] ? inr(snap.earnings[i].amount) : '',
      snap.deductions[i]?.label || '',
      snap.deductions[i] ? inr(snap.deductions[i].amount) : '',
    ]),
    foot: [
      ['Gross', inr(snap.gross), 'Total deductions', inr(snap.totalDeductions)],
      ['Net pay', inr(snap.net), '', ''],
    ],
  });
  doc.save(`payslip-${snap.staffName.replace(/\s+/g, '-').toLowerCase()}-${snap.year}-${String(snap.month + 1).padStart(2, '0')}.pdf`);
};

interface Props {
  staffId: string;
}

export const PayslipsTab: React.FC<Props> = ({ staffId }) => {
  const [rows, setRows] = useState<PayslipLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    const data = await payslipLinkService.listForStaff(staffId);
    setRows(
      [...data].sort((a, b) => (b.year - a.year) || (b.month - a.month)),
    );
    setLoading(false);
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  const handleDownload = async (row: PayslipLinkRow) => {
    if (!row.snapshot) return;
    setBusyId(row.id);
    try {
      await downloadPayslipPdf(row.snapshot);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Receipt size={18} className="text-indigo-500" /> Payslip history
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Every payslip issued to you. Downloads are generated on your device.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-xl border border-[var(--glass-border)] text-[var(--text-secondary)]"
          aria-label="Refresh payslip history"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] p-6 justify-center">
          <Loader2 className="animate-spin" size={16} /> Loading your payslips…
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-center text-sm text-[var(--text-secondary)] border border-dashed border-[var(--glass-border)] rounded-2xl p-8">
          No payslips have been issued to you yet.
        </div>
      )}

      <div className="space-y-2">
        {rows.map(row => {
          const active = isLinkActive(row);
          const snap = row.snapshot;
          return (
            <div
              key={row.id}
              className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-card)] p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {MONTHS[row.month] || ''} {row.year}
                </div>
                <div className="text-xs text-[var(--text-secondary)] truncate">
                  {snap ? `Net ${inr(snap.net)} · Gross ${inr(snap.gross)}` : 'Payslip'}
                </div>
                <div className="text-[11px] mt-1 flex items-center gap-1.5">
                  {active ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <ShieldCheck size={11} /> Valid till {new Date(row.expires_at).toLocaleDateString('en-IN')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-500">
                      <Ban size={11} /> {row.revoked_at ? 'Link revoked' : 'Link expired'} — download still available
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDownload(row)}
                disabled={!snap || busyId === row.id}
                className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50"
              >
                {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                PDF
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PayslipsTab;
