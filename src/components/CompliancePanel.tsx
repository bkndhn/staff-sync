import React, { useMemo, useState } from 'react';
import { FileText, Landmark, HeartPulse, Receipt, Link2, Loader2, Copy, Check } from 'lucide-react';
import { PayrollDetail, Staff } from '../types';
import {
  buildEpfoEcr,
  buildEsicReturn,
  buildForm24Q,
  buildTdsRegister,
  buildForm16PartB,
  download,
  type ComplianceFile,
} from '../utils/complianceExports';
import { computeRunTds } from '../utils/tdsCalculations';
import { payslipLinkService } from '../services/payslipLinkService';
import { customAlert } from './CustomDialog';

interface Props {
  details: PayrollDetail[];
  staff: Staff[];
  month: number; // 0-indexed
  year: number;
  employerName?: string;
  issuedBy?: string;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

const Card: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  file: ComplianceFile;
}> = ({ icon, title, subtitle, file }) => (
  <div className="border border-gray-200 rounded-xl p-3 bg-white flex flex-col gap-2">
    <div className="flex items-center gap-2">
      {icon}
      <span className="text-sm font-semibold text-gray-800">{title}</span>
    </div>
    <p className="text-xs text-gray-500">{subtitle}</p>
    <div className="text-xs text-gray-700">
      {file.rowCount} record{file.rowCount === 1 ? '' : 's'} · {inr(file.totalAmount)}
    </div>
    <button
      type="button"
      disabled={file.rowCount === 0}
      onClick={() => download(file)}
      className="mt-auto px-3 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 transition-colors"
    >
      Download
    </button>
    {file.skipped.length > 0 && (
      <details className="text-[11px] text-gray-600">
        <summary className="cursor-pointer">{file.skipped.length} excluded</summary>
        <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
          {file.skipped.map(s => <li key={s.staffId}>• {s.name} — {s.reason}</li>)}
        </ul>
      </details>
    )}
  </div>
);

export const CompliancePanel: React.FC<Props> = ({ details, staff, month, year, employerName, issuedBy }) => {
  const [issuing, setIssuing] = useState<string | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const epfo = useMemo(() => buildEpfoEcr(details, staff, month, year), [details, staff, month, year]);
  const esic = useMemo(() => buildEsicReturn(details, staff, month, year), [details, staff, month, year]);
  const form24q = useMemo(() => buildForm24Q(details, staff, month, year), [details, staff, month, year]);
  const register = useMemo(() => buildTdsRegister(details, staff, month, year), [details, staff, month, year]);
  const tdsRows = useMemo(() => computeRunTds(details, staff, month, year), [details, staff, month, year]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tdsRows;
    return tdsRows.filter(r => r.staff.name.toLowerCase().includes(q) || (r.staff.employeeCode || '').toLowerCase().includes(q));
  }, [tdsRows, search]);

  const issueLink = async (staffId: string) => {
    const row = tdsRows.find(r => r.staff.id === staffId);
    if (!row) return;
    setIssuing(staffId);
    try {
      const link = await payslipLinkService.issue(row.staff, row.detail, month, year, { employerName, issuedBy });
      setLinks(prev => ({ ...prev, [staffId]: link.url }));
      try { await navigator.clipboard.writeText(link.url); } catch { /* clipboard may be blocked */ }
    } catch (e) {
      customAlert(e instanceof Error ? e.message : 'Could not create the payslip link.');
    } finally {
      setIssuing(null);
    }
  };

  const copy = async (staffId: string) => {
    const url = links[staffId];
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(staffId);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={<Landmark size={16} className="text-indigo-600" />} title="EPFO ECR" subtitle="Provident Fund challan return (.txt, #~# format)" file={epfo} />
        <Card icon={<HeartPulse size={16} className="text-rose-600" />} title="ESIC return" subtitle="Monthly contribution upload (CSV)" file={esic} />
        <Card icon={<Receipt size={16} className="text-emerald-600" />} title="Form 24Q" subtitle="Quarterly TDS statement, Annexure I" file={form24q} />
        <Card icon={<FileText size={16} className="text-blue-600" />} title="TDS register" subtitle="Internal computation audit copy" file={register} />
      </div>

      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">Tax computation & payslip links</h3>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Employee</th>
                <th className="text-right px-3 py-2 font-medium">Regime</th>
                <th className="text-right px-3 py-2 font-medium">Taxable</th>
                <th className="text-right px-3 py-2 font-medium">Annual tax</th>
                <th className="text-right px-3 py-2 font-medium">TDS / month</th>
                <th className="text-right px-3 py-2 font-medium">Documents</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.staff.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-900">
                    {row.staff.name}
                    <span className="block text-[11px] text-gray-500">{row.staff.employeeCode || row.staff.location}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{row.tds.regime === 'old' ? 'Old' : 'New'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{inr(row.tds.taxableIncome)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{inr(row.tds.annualTax)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{inr(row.tds.monthlyTds)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => download(buildForm16PartB(row, month, year, employerName))}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                      >
                        Form 16 B
                      </button>
                      {links[row.staff.id] ? (
                        <button
                          type="button"
                          onClick={() => copy(row.staff.id)}
                          className="px-2.5 py-1 text-xs rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-1"
                        >
                          {copied === row.staff.id ? <Check size={12} /> : <Copy size={12} />} Copy link
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={issuing === row.staff.id}
                          onClick={() => issueLink(row.staff.id)}
                          className="px-2.5 py-1 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-1"
                        >
                          {issuing === row.staff.id ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} Payslip link
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">No employees in this payroll run.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-gray-500 border-t border-gray-100">
          Payslip links are valid for 30 days, open without a login, and can be revoked at any time. Tax is projected across the remaining months of the financial year.
        </p>
      </div>
    </div>
  );
};

export default CompliancePanel;
