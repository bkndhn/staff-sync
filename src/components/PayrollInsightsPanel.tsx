import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Banknote,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { PayrollDetail, Staff } from '../types';
import { detectPayrollAnomalies, type AnomalyReport } from '../utils/payrollAnomalies';
import { buildPayrollVariance, type VarianceReport } from '../utils/payrollVariance';
import { buildBankPaymentFile, downloadBankPaymentFile, type BankFormat } from '../utils/bankExport';
import { payrollService } from '../services/payrollService';
import { customAlert } from './CustomDialog';

interface Props {
  details: PayrollDetail[];
  staff: Staff[];
  month: number; // 0-indexed
  year: number;
  onReport?: (report: AnomalyReport) => void;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

const prevPeriod = (month: number, year: number) =>
  month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year };

const BANK_FORMATS: { key: BankFormat; label: string }[] = [
  { key: 'hdfc', label: 'HDFC ENet' },
  { key: 'icici', label: 'ICICI CIB' },
  { key: 'sbi', label: 'SBI CINB' },
  { key: 'generic', label: 'Generic NEFT' },
];

export const PayrollInsightsPanel: React.FC<Props> = ({ details, staff, month, year, onReport }) => {
  const [priorDetails, setPriorDetails] = useState<PayrollDetail[]>([]);
  const [loadingPrior, setLoadingPrior] = useState(true);
  const [openSection, setOpenSection] = useState<'anomalies' | 'variance' | 'bank' | null>('anomalies');
  const [bankFormat, setBankFormat] = useState<BankFormat>('hdfc');
  const [debitAccount, setDebitAccount] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingPrior(true);
      try {
        const { month: pm, year: py } = prevPeriod(month, year);
        const run = await payrollService.getPayrollRun(pm, py);
        if (!run) {
          if (!cancelled) setPriorDetails([]);
          return;
        }
        const snaps = await payrollService.getSnapshots(run.id);
        if (!cancelled) setPriorDetails(snaps.map(s => s.salaryDetail).filter(Boolean));
      } catch {
        if (!cancelled) setPriorDetails([]);
      } finally {
        if (!cancelled) setLoadingPrior(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [month, year]);

  const report: AnomalyReport = useMemo(
    () => detectPayrollAnomalies(details, staff, priorDetails.length ? [priorDetails] : []),
    [details, staff, priorDetails],
  );

  const variance: VarianceReport = useMemo(
    () => buildPayrollVariance(details, priorDetails, staff),
    [details, priorDetails, staff],
  );

  useEffect(() => { onReport?.(report); }, [report, onReport]);

  const bankPreview = useMemo(
    () => buildBankPaymentFile(details, staff, month + 1, year, { format: bankFormat, debitAccount }),
    [details, staff, month, year, bankFormat, debitAccount],
  );

  const handleDownloadBankFile = () => {
    if (bankPreview.rowCount === 0) {
      customAlert('No staff are eligible for a bank transfer this period. Check payment mode and bank details.');
      return;
    }
    downloadBankPaymentFile(bankPreview);
  };

  const Section: React.FC<{ id: 'anomalies' | 'variance' | 'bank'; title: string; icon: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }> = ({ id, title, icon, badge, children }) => (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpenSection(openSection === id ? null : id)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          {icon}
          {title}
        </span>
        <span className="flex items-center gap-2">
          {badge}
          {openSection === id ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </span>
      </button>
      {openSection === id && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Pre-run anomaly checks */}
      <Section
        id="anomalies"
        title="Pre-run checks"
        icon={report.ok ? <ShieldCheck size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-red-600" />}
        badge={
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${report.ok ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
            {report.criticalCount} critical · {report.warningCount} warning
          </span>
        }
      >
        {report.anomalies.length === 0 ? (
          <p className="text-sm text-gray-600 pt-2">No issues detected. This payroll is safe to submit.</p>
        ) : (
          <ul className="space-y-2 pt-2">
            {report.anomalies.map(a => (
              <li
                key={a.code}
                className={`p-3 rounded-lg border text-sm ${a.severity === 'critical' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
              >
                <div className={`font-semibold ${a.severity === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                  {a.title}
                </div>
                <div className="text-xs text-gray-700 mt-0.5 break-words">{a.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Variance waterfall */}
      <Section
        id="variance"
        title="Variance vs last period"
        icon={variance.change >= 0 ? <TrendingUp size={16} className="text-indigo-600" /> : <TrendingDown size={16} className="text-indigo-600" />}
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full border font-medium text-indigo-700 bg-indigo-50 border-indigo-200">
            {variance.change >= 0 ? '+' : '−'}{inr(Math.abs(variance.change))}
          </span>
        }
      >
        {loadingPrior ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 pt-3">
            <Loader2 size={14} className="animate-spin" /> Loading previous period…
          </div>
        ) : priorDetails.length === 0 ? (
          <p className="text-sm text-gray-600 pt-2">No generated payroll found for the previous month, so there is nothing to compare against yet.</p>
        ) : (
          <div className="pt-2 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {[
                { label: 'Last period', value: inr(variance.previousTotal) },
                { label: 'This period', value: inr(variance.currentTotal) },
                { label: 'Change', value: `${variance.change >= 0 ? '+' : '−'}${inr(Math.abs(variance.change))}` },
                { label: 'Headcount', value: `${variance.previousHeadcount} → ${variance.currentHeadcount}` },
              ].map(k => (
                <div key={k.label} className="p-2 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-[11px] text-gray-500">{k.label}</div>
                  <div className="text-sm font-semibold text-gray-900">{k.value}</div>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {variance.steps.map(step => {
                const max = Math.max(...variance.steps.map(s => Math.abs(s.amount)), 1);
                const width = (Math.abs(step.amount) / max) * 100;
                const positive = step.amount >= 0;
                return (
                  <div key={step.key} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 text-xs text-gray-700 truncate" title={step.label}>{step.label}</span>
                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${positive ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${width}%` }} />
                    </div>
                    <span className={`w-24 text-right text-xs font-semibold ${positive ? 'text-emerald-700' : 'text-red-700'}`}>
                      {positive ? '+' : '−'}{inr(Math.abs(step.amount))}
                    </span>
                  </div>
                );
              })}
              {variance.steps.length === 0 && (
                <p className="text-sm text-gray-600">Net payout is unchanged from last period.</p>
              )}
            </div>
          </div>
        )}
      </Section>

      {/* Bank bulk payment file */}
      <Section
        id="bank"
        title="Bank bulk payment file"
        icon={<Banknote size={16} className="text-blue-600" />}
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full border font-medium text-blue-700 bg-blue-50 border-blue-200">
            {bankPreview.rowCount} payee · {inr(bankPreview.totalAmount)}
          </span>
        }
      >
        <div className="pt-2 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={bankFormat}
              onChange={e => setBankFormat(e.target.value as BankFormat)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900"
            >
              {BANK_FORMATS.map(f => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <input
              type="text"
              value={debitAccount}
              onChange={e => setDebitAccount(e.target.value)}
              placeholder="Company debit account no."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400"
            />
            <button
              type="button"
              onClick={handleDownloadBankFile}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Download CSV
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Amounts up to ₹2,00,000 are marked IMPS, above that NEFT. Only staff set to bank payout with a valid account and IFSC are included.
          </p>
          {bankPreview.skipped.length > 0 && (
            <details className="text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">
                {bankPreview.skipped.length} excluded from the file
              </summary>
              <ul className="mt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                {bankPreview.skipped.map(s => (
                  <li key={s.staffId}>• {s.name} — {s.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Section>
    </div>
  );
};

export default PayrollInsightsPanel;
