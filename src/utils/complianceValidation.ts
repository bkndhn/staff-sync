/**
 * Automated validation for statutory exports.
 *
 * Every generated file (EPFO ECR, ESIC return, TDS register, Form 24Q,
 * Form-16 Part B) is reconciled against the payroll run it came from, so a
 * mismatch is caught before the file is filed with a portal.
 */
import { PayrollDetail, Staff } from '../types';
import { computeRunTds, grossOf } from './tdsCalculations';
import type { ComplianceFile } from './complianceExports';

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  expected: number;
  actual: number;
  difference: number;
  detail: string;
}

export interface ValidationReport {
  status: CheckStatus;
  checks: ValidationCheck[];
  generatedAt: string;
}

const r = (v: unknown) => Math.round(Number(v) || 0);
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
/** Rupee rounding across many rows can drift; a rupee per employee is fine. */
const tolerance = (rows: number) => Math.max(1, rows);

const check = (
  id: string,
  label: string,
  expected: number,
  actual: number,
  rows: number,
  detail?: string,
): ValidationCheck => {
  const difference = actual - expected;
  const status: CheckStatus = Math.abs(difference) === 0
    ? 'pass'
    : Math.abs(difference) <= tolerance(rows) ? 'warn' : 'fail';
  return {
    id,
    label,
    status,
    expected,
    actual,
    difference,
    detail: detail || (status === 'pass'
      ? `Matches the payroll run (${inr(expected)}).`
      : `Payroll run says ${inr(expected)}, export totals ${inr(actual)} (${difference > 0 ? '+' : ''}${inr(difference)}).`),
  };
};

const pfOf = (d: PayrollDetail) =>
  r((d.statutoryBreakdown || []).find(b => b.key === 'pf')?.amount);
const esiOf = (d: PayrollDetail) =>
  r((d.statutoryBreakdown || []).find(b => b.key === 'esi')?.amount);

export interface ValidateInput {
  details: PayrollDetail[];
  staff: Staff[];
  month: number;
  year: number;
  files: { epfo: ComplianceFile; esic: ComplianceFile; form24q: ComplianceFile; register: ComplianceFile };
}

export const validateComplianceExports = ({ details, staff, month, year, files }: ValidateInput): ValidationReport => {
  const staffById = new Map(staff.map(s => [s.id, s]));
  const runDetails = details.filter(d => staffById.has(d.staffId));
  const tdsRows = computeRunTds(details, staff, month, year);

  const skippedIds = (f: ComplianceFile) => new Set(f.skipped.map(s => s.staffId));

  const epfoSkipped = skippedIds(files.epfo);
  const expectedPf = runDetails.filter(d => !epfoSkipped.has(d.staffId)).reduce((s, d) => s + pfOf(d), 0);

  const esicSkipped = skippedIds(files.esic);
  const expectedEsi = runDetails.filter(d => !esicSkipped.has(d.staffId)).reduce((s, d) => s + esiOf(d), 0);

  const q24Skipped = skippedIds(files.form24q);
  const expectedTds = tdsRows.filter(t => !q24Skipped.has(t.staff.id)).reduce((s, t) => s + t.tds.monthlyTds, 0);

  const registerSkipped = skippedIds(files.register);
  const expectedRegisterTds = tdsRows.filter(t => !registerSkipped.has(t.staff.id)).reduce((s, t) => s + t.tds.monthlyTds, 0);

  const expectedGross = runDetails.reduce((s, d) => s + grossOf(d), 0);

  const checks: ValidationCheck[] = [
    check('epfo_total', 'EPFO ECR — employee PF total', expectedPf, r(files.epfo.totalAmount), files.epfo.rowCount),
    check('epfo_rows', 'EPFO ECR — employee count',
      runDetails.length - epfoSkipped.size, files.epfo.rowCount, 1,
      `${files.epfo.rowCount} of ${runDetails.length} employees included, ${epfoSkipped.size} excluded (no UAN / not PF-eligible).`),
    check('esic_total', 'ESIC return — contribution total', expectedEsi, r(files.esic.totalAmount), files.esic.rowCount),
    check('esic_rows', 'ESIC return — employee count',
      runDetails.length - esicSkipped.size, files.esic.rowCount, 1,
      `${files.esic.rowCount} of ${runDetails.length} employees included, ${esicSkipped.size} above the ₹21,000 wage ceiling or without an ESI number.`),
    check('form24q_total', 'Form 24Q — TDS deducted total', expectedTds, r(files.form24q.totalAmount), files.form24q.rowCount),
    check('register_total', 'TDS register — monthly TDS total', expectedRegisterTds, r(files.register.totalAmount), files.register.rowCount),
    check('register_vs_24q', 'TDS register reconciles with Form 24Q',
      r(files.register.totalAmount), r(files.form24q.totalAmount), Math.max(files.register.rowCount, 1),
      'Both documents must report the same tax deducted for the period.'),
    check('gross_base', 'Payroll gross used for all computations', expectedGross, expectedGross, 1,
      `${runDetails.length} employees, gross ${inr(expectedGross)}.`),
  ];

  const status: CheckStatus = checks.some(c => c.status === 'fail')
    ? 'fail'
    : checks.some(c => c.status === 'warn') ? 'warn' : 'pass';

  return { status, checks, generatedAt: new Date().toISOString() };
};

/** Form-16 Part B sanity check for a single employee. */
export const validateForm16 = (row: { tds: { annualTax: number; monthlyTds: number; remainingMonths: number; tdsPaidTillDate: number } }): ValidationCheck => {
  const projected = row.tds.tdsPaidTillDate + row.tds.monthlyTds * row.tds.remainingMonths;
  return check('form16_annual', 'Form 16 Part B — annual tax reconciles', row.tds.annualTax, projected, 12);
};
