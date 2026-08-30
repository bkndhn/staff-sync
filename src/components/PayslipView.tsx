import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, ShieldCheck, AlertTriangle } from 'lucide-react';
import { fetchPayslipByToken, type PayslipSnapshot } from '../services/payslipLinkService';

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Simple SVG donut of earnings vs deductions — no chart dependency needed. */
const Donut: React.FC<{ gross: number; deductions: number }> = ({ gross, deductions }) => {
  const total = Math.max(1, gross);
  const pct = Math.min(1, Math.max(0, deductions / total));
  const c = 2 * Math.PI * 52;
  return (
    <svg viewBox="0 0 130 130" className="w-36 h-36">
      <circle cx="65" cy="65" r="52" fill="none" stroke="#dbeafe" strokeWidth="16" />
      <circle
        cx="65" cy="65" r="52" fill="none" stroke="#2563eb" strokeWidth="16" strokeLinecap="round"
        strokeDasharray={`${c * (1 - pct)} ${c}`} transform="rotate(-90 65 65)"
      />
      <text x="65" y="61" textAnchor="middle" className="fill-slate-500" style={{ fontSize: 10 }}>Take home</text>
      <text x="65" y="78" textAnchor="middle" className="fill-slate-900 font-semibold" style={{ fontSize: 13 }}>
        {Math.round((1 - pct) * 100)}%
      </text>
    </svg>
  );
};

export const PayslipView: React.FC<{ token: string }> = ({ token }) => {
  const [slip, setSlip] = useState<PayslipSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPayslipByToken(token)
      .then(data => { if (!cancelled) setSlip(data); })
      .catch(e => { if (!cancelled) setError(e?.message || 'This payslip link could not be opened.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const period = useMemo(() => (slip ? `${MONTHS[slip.month] || ''} ${slip.year}` : ''), [slip]);

  const downloadPdf = async () => {
    if (!slip) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Payslip — ${period}`, 14, 18);
    doc.setFontSize(11);
    doc.text(`${slip.staffName}${slip.employeeCode ? ` (${slip.employeeCode})` : ''}`, 14, 27);
    doc.text(`${slip.designation || ''}${slip.location ? ` · ${slip.location}` : ''}`, 14, 34);
    autoTable(doc, {
      startY: 42,
      head: [['Earnings', 'Amount', 'Deductions', 'Amount']],
      body: Array.from({ length: Math.max(slip.earnings.length, slip.deductions.length) }, (_, i) => [
        slip.earnings[i]?.label || '',
        slip.earnings[i] ? inr(slip.earnings[i].amount) : '',
        slip.deductions[i]?.label || '',
        slip.deductions[i] ? inr(slip.deductions[i].amount) : '',
      ]),
      foot: [['Gross', inr(slip.gross), 'Total deductions', inr(slip.totalDeductions)], ['Net pay', inr(slip.net), '', '']],
    });
    doc.save(`payslip-${slip.staffName.replace(/\s+/g, '-').toLowerCase()}-${slip.year}-${String(slip.month + 1).padStart(2, '0')}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center text-slate-600">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading your payslip…
      </div>
    );
  }

  if (error || !slip) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center border border-red-200 bg-red-50 rounded-2xl p-6">
          <AlertTriangle className="mx-auto text-red-600 mb-2" size={26} />
          <h1 className="text-base font-semibold text-red-800">Payslip unavailable</h1>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-3">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-blue-600 text-white px-5 py-4">
          <p className="text-xs opacity-80">{slip.employerName || 'Payslip'}</p>
          <h1 className="text-lg font-semibold">{period}</h1>
          <p className="text-sm opacity-90 mt-1">
            {slip.staffName}{slip.employeeCode ? ` · ${slip.employeeCode}` : ''}
          </p>
          <p className="text-xs opacity-80">{slip.designation || ''}{slip.location ? ` · ${slip.location}` : ''}</p>
        </div>

        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-slate-100">
          <Donut gross={slip.gross} deductions={slip.totalDeductions} />
          <div className="flex-1 space-y-2 text-right">
            <div>
              <div className="text-xs text-slate-500">Net pay</div>
              <div className="text-2xl font-bold text-slate-900">{inr(slip.net)}</div>
            </div>
            <div className="text-xs text-slate-600">Gross {inr(slip.gross)} · Deductions {inr(slip.totalDeductions)}</div>
            <div className="text-xs text-slate-600">
              Present {slip.presentDays} · Half {slip.halfDays} · Leave {slip.leaveDays}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-5 py-4">
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Earnings</h2>
            <ul className="space-y-1.5">
              {slip.earnings.map(e => (
                <li key={e.label} className="flex justify-between text-sm text-slate-700">
                  <span>{e.label}</span><span className="font-medium text-slate-900">{inr(e.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between text-sm pt-2 border-t border-slate-100 font-semibold text-slate-900">
                <span>Gross</span><span>{inr(slip.gross)}</span>
              </li>
            </ul>
          </section>
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Deductions</h2>
            <ul className="space-y-1.5">
              {slip.deductions.length === 0 && <li className="text-sm text-slate-500">No deductions</li>}
              {slip.deductions.map(d => (
                <li key={d.label} className="flex justify-between text-sm text-slate-700">
                  <span>{d.label}</span><span className="font-medium text-slate-900">{inr(d.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between text-sm pt-2 border-t border-slate-100 font-semibold text-slate-900">
                <span>Total</span><span>{inr(slip.totalDeductions)}</span>
              </li>
            </ul>
          </section>
        </div>

        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={downloadPdf}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Download size={16} /> Download PDF payslip
          </button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-3">
            <ShieldCheck size={12} /> Secure private link. Do not forward it — anyone with the link can view this payslip.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PayslipView;
