/**
 * Statutory filing exports: EPFO ECR, ESIC monthly contribution, Form 24Q
 * (TDS quarterly return, Annexure I) and Form-16 Part B.
 *
 * All builders are pure: they take a payroll run's details + staff snapshots
 * and return a filename plus the file body, ready for download.
 */
import { PayrollDetail, Staff } from '../types';
import { computeRunTds, financialYearLabel, grossOf, type StaffTdsRow } from './tdsCalculations';

export interface ComplianceFile {
  filename: string;
  content: string;
  mime: string;
  rowCount: number;
  totalAmount: number;
  skipped: { staffId: string; name: string; reason: string }[];
}

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const r0 = (v: number) => Math.max(0, Math.round(v));
const clean = (v?: string | null) => (v || '').replace(/[#~",\r\n]/g, ' ').trim();

const csv = (rows: (string | number)[][]) =>
  rows
    .map(r =>
      r
        .map(c => (typeof c === 'string' && /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
        .join(','),
    )
    .join('\r\n');

const period = (month: number, year: number) => `${year}-${String(month + 1).padStart(2, '0')}`;

const statutory = (d: PayrollDetail, key: string): number =>
  n((d.statutoryBreakdown || []).find(b => b.key === key)?.amount);

const gross = (d: PayrollDetail) => r0(n(d.grossPayroll ?? d.grossSalary));

/** PF wage is capped at the statutory ceiling of ₹15,000. */
export const PF_WAGE_CEILING = 15000;
/** ESI applies only when monthly gross is at or below ₹21,000. */
export const ESI_GROSS_CEILING = 21000;

export const download = (file: ComplianceFile) => {
  const blob = new Blob(['\uFEFF' + file.content], { type: `${file.mime};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * EPFO Electronic Challan-cum-Return (ECR 2.0) text file.
 * Layout: UAN#~#Name#~#GrossWages#~#EPFWages#~#EPSWages#~#EDLIWages#~#EPFContriRemitted
 *         #~#EPSContriRemitted#~#EPFEPSDiffRemitted#~#NCPDays#~#RefundOfAdvances
 */
export const buildEpfoEcr = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
): ComplianceFile => {
  const byId = new Map(staff.map(s => [s.id, s]));
  const lines: string[] = [];
  const skipped: ComplianceFile['skipped'] = [];
  let total = 0;

  details.forEach(d => {
    const member = byId.get(d.staffId);
    if (!member) return;
    const employeePf = r0(statutory(d, 'pf'));
    if (employeePf <= 0) {
      skipped.push({ staffId: d.staffId, name: member.name, reason: 'No PF deduction this period' });
      return;
    }
    const uan = clean(member.pfNumber);
    if (!uan) {
      skipped.push({ staffId: d.staffId, name: member.name, reason: 'Missing UAN / PF number' });
      return;
    }
    const grossWages = gross(d);
    const epfWages = Math.min(r0(n(d.basicEarned) + n(d.hraEarned)), PF_WAGE_CEILING);
    const epsWages = epfWages;
    const epsContrib = r0((epsWages * 8.33) / 100);
    const epfDiff = Math.max(0, employeePf - epsContrib);
    const ncpDays = Math.max(0, Math.round(n(d.leaveDays)));

    lines.push(
      [
        uan,
        clean(member.name).toUpperCase(),
        grossWages,
        epfWages,
        epsWages,
        epfWages,
        employeePf,
        epsContrib,
        epfDiff,
        ncpDays,
        0,
      ].join('#~#'),
    );
    total += employeePf;
  });

  return {
    filename: `epfo-ecr-${period(month, year)}.txt`,
    content: lines.join('\r\n'),
    mime: 'text/plain',
    rowCount: lines.length,
    totalAmount: total,
    skipped,
  };
};

/**
 * ESIC monthly contribution upload (IP number, name, days, wages, contribution).
 */
export const buildEsicReturn = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
): ComplianceFile => {
  const byId = new Map(staff.map(s => [s.id, s]));
  const rows: (string | number)[][] = [
    ['IP Number', 'IP Name', 'No of Days for which wages paid', 'Total Monthly Wages', 'Reason Code for Zero workings days', 'Last Working Day', 'Employee Contribution'],
  ];
  const skipped: ComplianceFile['skipped'] = [];
  let total = 0;

  details.forEach(d => {
    const member = byId.get(d.staffId);
    if (!member) return;
    const contribution = r0(statutory(d, 'esi'));
    const wages = gross(d);
    if (wages > ESI_GROSS_CEILING) {
      skipped.push({ staffId: d.staffId, name: member.name, reason: 'Gross above ₹21,000 ESI ceiling' });
      return;
    }
    if (contribution <= 0) {
      skipped.push({ staffId: d.staffId, name: member.name, reason: 'No ESI deduction this period' });
      return;
    }
    const ip = clean(member.esiNumber);
    if (!ip) {
      skipped.push({ staffId: d.staffId, name: member.name, reason: 'Missing ESIC IP number' });
      return;
    }
    const days = Math.round(n(d.presentDays) + n(d.halfDays) / 2);
    rows.push([ip, clean(member.name).toUpperCase(), days, wages, days === 0 ? '2' : '0', '', contribution]);
    total += contribution;
  });

  return {
    filename: `esic-contribution-${period(month, year)}.csv`,
    content: csv(rows),
    mime: 'text/csv',
    rowCount: rows.length - 1,
    totalAmount: total,
    skipped,
  };
};

/**
 * Form 24Q Annexure I — deductee-wise TDS statement for the payroll month.
 */
export const buildForm24Q = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
): ComplianceFile => {
  const rows: (string | number)[][] = [
    ['Sr No', 'Employee Reference No', 'PAN of the deductee', 'Name of the deductee', 'Section Code', 'Date of Payment', 'Amount Paid/Credited', 'TDS', 'Surcharge', 'Education Cess', 'Total Tax Deducted', 'Date of Deduction'],
  ];
  const skipped: ComplianceFile['skipped'] = [];
  let total = 0;
  const lastDay = new Date(year, month + 1, 0);
  const payDate = `${String(lastDay.getDate()).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;

  const tdsRows = computeRunTds(details, staff, month, year);
  tdsRows.forEach(({ staff: member, detail, tds }) => {
    const deducted = r0(statutory(detail, 'tds')) || tds.monthlyTds;
    if (deducted <= 0) {
      skipped.push({ staffId: member.id, name: member.name, reason: 'No tax payable this month' });
      return;
    }
    const pan = clean((member as unknown as { panNumber?: string }).panNumber) || 'PANNOTAVBL';
    rows.push([
      rows.length,
      clean(member.employeeCode || member.id.slice(0, 8)),
      pan.toUpperCase(),
      clean(member.name).toUpperCase(),
      '92B',
      payDate,
      grossOf(detail),
      deducted,
      0,
      0,
      deducted,
      payDate,
    ]);
    total += deducted;
  });

  return {
    filename: `form-24q-annexure1-${period(month, year)}.csv`,
    content: csv(rows),
    mime: 'text/csv',
    rowCount: rows.length - 1,
    totalAmount: total,
    skipped,
  };
};

/** Consolidated TDS register for the month (internal audit copy). */
export const buildTdsRegister = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
): ComplianceFile => {
  const rows: (string | number)[][] = [
    ['Employee Code', 'Name', 'Regime', 'Monthly Gross', 'Projected Annual Gross', 'Standard Deduction', 'Chapter VI-A', 'Taxable Income', 'Annual Tax', 'Paid Till Date', 'Remaining Months', 'TDS This Month'],
  ];
  let total = 0;
  computeRunTds(details, staff, month, year).forEach(({ staff: member, detail, tds }) => {
    rows.push([
      clean(member.employeeCode),
      clean(member.name),
      tds.regime === 'old' ? 'Old' : 'New',
      grossOf(detail),
      tds.annualGross,
      tds.standardDeduction,
      tds.chapterVIA,
      tds.taxableIncome,
      tds.annualTax,
      tds.tdsPaidTillDate,
      tds.remainingMonths,
      tds.monthlyTds,
    ]);
    total += tds.monthlyTds;
  });

  return {
    filename: `tds-register-${period(month, year)}.csv`,
    content: csv(rows),
    mime: 'text/csv',
    rowCount: rows.length - 1,
    totalAmount: total,
    skipped: [],
  };
};

const inr = (v: number) => `₹${r0(v).toLocaleString('en-IN')}`;

/** Form-16 Part B (annual tax computation statement) as a printable HTML file. */
export const buildForm16PartB = (
  row: StaffTdsRow,
  month: number,
  year: number,
  employerName = 'Employer',
): ComplianceFile => {
  const { staff: member, tds } = row;
  const fy = financialYearLabel(month, year);
  const line = (label: string, value: string, strong = false) =>
    `<tr><td>${label}</td><td class="amt${strong ? ' strong' : ''}">${value}</td></tr>`;

  const content = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Form 16 Part B — ${clean(member.name)} — FY ${fy}</title>
<style>
 body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:32px;background:#fff}
 h1{font-size:18px;margin:0 0 4px} h2{font-size:14px;margin:24px 0 8px;color:#1d4ed8}
 .muted{color:#475569;font-size:12px}
 table{width:100%;border-collapse:collapse;margin-top:8px;font-size:13px}
 td{border:1px solid #e2e8f0;padding:7px 10px}
 .amt{text-align:right;width:180px} .strong{font-weight:700;background:#f1f5f9}
 @media print{body{margin:12mm}}
</style></head>
<body>
 <h1>FORM NO. 16 — PART B</h1>
 <div class="muted">Annexure to certificate under section 203 of the Income-tax Act, 1961 · Financial Year ${fy}</div>
 <h2>Particulars</h2>
 <table>
  ${line('Employer', clean(employerName))}
  ${line('Employee', clean(member.name))}
  ${line('Employee code', clean(member.employeeCode) || '—')}
  ${line('Tax regime', tds.regime === 'old' ? 'Old regime' : 'New regime (default)')}
 </table>
 <h2>Details of salary paid and tax computed</h2>
 <table>
  ${line('1. Gross salary (projected annual)', inr(tds.annualGross))}
  ${line('2. Standard deduction u/s 16(ia)', inr(tds.standardDeduction))}
  ${line('3. Deductions under Chapter VI-A', inr(tds.chapterVIA))}
  ${line('4. Total taxable income', inr(tds.taxableIncome), true)}
  ${line('5. Tax on total income', inr(tds.slabTax))}
  ${line('6. Rebate u/s 87A', inr(tds.rebate87A))}
  ${line('7. Surcharge', inr(tds.surcharge))}
  ${line('8. Health & education cess @ 4%', inr(tds.cess))}
  ${line('9. Total tax payable for the year', inr(tds.annualTax), true)}
  ${line('10. Tax deducted till date', inr(tds.tdsPaidTillDate))}
  ${line('11. Tax to be deducted per remaining month', inr(tds.monthlyTds), true)}
 </table>
 <p class="muted">Computer-generated statement. Figures are projected from the ${new Date(year, month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })} payroll run.</p>
</body></html>`;

  return {
    filename: `form16-partB-${clean(member.employeeCode || member.name).replace(/\s+/g, '-').toLowerCase()}-${fy}.html`,
    content,
    mime: 'text/html',
    rowCount: 1,
    totalAmount: tds.annualTax,
    skipped: [],
  };
};
