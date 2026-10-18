import { PayrollDetail, Staff } from '../types';

export type BankFormat = 'hdfc' | 'icici' | 'sbi' | 'generic';

export interface BankExportOptions {
  format: BankFormat;
  /** Company debit account used as the funding account in the file. */
  debitAccount?: string;
  /** Value date for the batch, YYYY-MM-DD. Defaults to today. */
  valueDate?: string;
  /** Narration prefix, e.g. "SALARY AUG2026". */
  narration?: string;
}

export interface BankExportResult {
  filename: string;
  csv: string;
  rowCount: number;
  totalAmount: number;
  payees: { code: string; name: string; account: string; ifsc: string; amount: number; mode: string }[];
  skipped: { staffId: string; name: string; reason: string }[];
}

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const net = (d: PayrollDetail) => Math.round(n(d.netPayroll ?? d.netSalary));
const clean = (v?: string | null) => (v || '').replace(/[",\r\n]/g, ' ').trim();
const acc = (v?: string | null) => (v || '').replace(/\s|-/g, '').toUpperCase();

/** Indian IFSC: 4 letters, a zero, then 6 letters/digits (e.g. HDFC0001234). */
export const isValidIfsc = (v?: string | null) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(acc(v));
/** Indian bank account numbers are 9–18 digits. */
export const isValidAccount = (v?: string | null) => /^\d{9,18}$/.test(acc(v));

const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const toCsv = (rows: (string | number)[][]) =>
  rows.map(r => r.map(c => (typeof c === 'string' && /[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\r\n');

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Builds a bank bulk-payment (NEFT/IMPS) upload file for a payroll period.
 * Only staff with paymentMode === 'bank' and complete account details are included.
 */
export const buildBankPaymentFile = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
  options: BankExportOptions,
): BankExportResult => {
  const { format, debitAccount = '', valueDate, narration } = options;
  const staffById = new Map(staff.map(s => [s.id, s]));
  const date = valueDate || new Date().toISOString().slice(0, 10);
  const label = narration || `SALARY ${MONTHS[Math.max(0, Math.min(11, month - 1))]}${year}`;

  const skipped: BankExportResult['skipped'] = [];
  const payable: { member: Staff; amount: number }[] = [];

  details.forEach(d => {
    const member = staffById.get(d.staffId);
    if (!member) return;
    const amount = net(d);
    const name = member.name;
    if ((member.paymentMode || 'cash') !== 'bank') {
      skipped.push({ staffId: d.staffId, name, reason: 'Cash payout' });
      return;
    }
    if (amount <= 0) {
      skipped.push({ staffId: d.staffId, name, reason: 'Net pay is zero or negative' });
      return;
    }
    if (!acc(member.bankAccountNumber) || !acc(member.ifscCode)) {
      skipped.push({ staffId: d.staffId, name, reason: 'Missing account number or IFSC' });
      return;
    }
    if (!isValidIfsc(member.ifscCode)) {
      skipped.push({ staffId: d.staffId, name, reason: `Invalid IFSC "${acc(member.ifscCode)}"` });
      return;
    }
    if (!isValidAccount(member.bankAccountNumber)) {
      skipped.push({ staffId: d.staffId, name, reason: 'Account number must be 9–18 digits' });
      return;
    }
    payable.push({ member, amount });
  });

  const mode = (amount: number) => (amount <= 200000 ? 'IMPS' : 'NEFT');
  let rows: (string | number)[][] = [];

  if (format === 'hdfc') {
    // HDFC ENet bulk transfer layout
    rows.push(['Transaction Type', 'Beneficiary Code', 'Beneficiary Account Number', 'Amount', 'Beneficiary Name', 'Debit Account No', 'Value Date', 'IFSC Code', 'Narration']);
    payable.forEach(({ member, amount }) => {
      rows.push([mode(amount), clean(member.employeeCode || member.id.slice(0, 8)), acc(member.bankAccountNumber), amount, clean(member.name), acc(debitAccount), ddmmyyyy(date), acc(member.ifscCode), clean(label)]);
    });
  } else if (format === 'icici') {
    // ICICI Corporate Internet Banking bulk upload layout
    rows.push(['PYMT_MODE', 'DEBIT_ACC_NO', 'BNF_NAME', 'BENE_ACC_NO', 'BENE_IFSC', 'AMOUNT', 'DEBIT_NARR', 'CREDIT_NARR', 'MOBILE_NUM', 'REMARK', 'PYMT_DATE']);
    payable.forEach(({ member, amount }) => {
      rows.push([mode(amount), acc(debitAccount), clean(member.name), acc(member.bankAccountNumber), acc(member.ifscCode), amount, clean(label), clean(label), clean(member.contactNumber), clean(member.employeeCode), ddmmyyyy(date)]);
    });
  } else if (format === 'sbi') {
    // SBI Corporate (CINB) bulk salary upload layout
    rows.push(['SR No', 'Beneficiary Name', 'Beneficiary Account Number', 'IFSC', 'Amount', 'Payment Mode', 'Remarks', 'Date']);
    payable.forEach(({ member, amount }, i) => {
      rows.push([i + 1, clean(member.name), acc(member.bankAccountNumber), acc(member.ifscCode), amount, mode(amount), clean(label), ddmmyyyy(date)]);
    });
  } else {
    rows.push(['S.No', 'Employee Code', 'Employee Name', 'Account Number', 'IFSC', 'Bank Name', 'Amount', 'Mode', 'Value Date', 'Narration']);
    payable.forEach(({ member, amount }, i) => {
      rows.push([i + 1, clean(member.employeeCode), clean(member.name), acc(member.bankAccountNumber), acc(member.ifscCode), clean(member.bankName), amount, mode(amount), ddmmyyyy(date), clean(label)]);
    });
  }

  return {
    payees: payable.map(({ member, amount }) => ({ code: member.employeeCode || '', name: member.name, account: acc(member.bankAccountNumber), ifsc: acc(member.ifscCode), amount, mode: mode(amount) })),
    filename: `bank-payment-${format}-${year}-${String(month).padStart(2, '0')}.csv`,
    csv: toCsv(rows),
    rowCount: payable.length,
    totalAmount: payable.reduce((s, p) => s + p.amount, 0),
    skipped,
  };
};

export const downloadBankPaymentFile = (result: BankExportResult) => {
  const blob = new Blob(['\uFEFF' + result.csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = result.filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};


/** Printable disbursement authorization sheet (PDF) for signatories. Uses "Rs." for the rupee. */
export const downloadDisbursementAuthorization = async (result: BankExportResult, month: number, year: number, debitAccount?: string) => {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  const rs = (v: number) => `Rs. ${v.toLocaleString('en-IN')}`;
  doc.setFontSize(14);
  doc.text(`Salary Disbursement Authorization - ${MONTHS[month - 1]} ${year}`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Debit account: ${debitAccount || '-'}    Payees: ${result.rowCount}    Total: ${rs(result.totalAmount)}`, 14, 24);
  autoTable(doc, {
    startY: 30,
    head: [['#', 'Code', 'Name', 'Account', 'IFSC', 'Mode', 'Amount']],
    body: result.payees.map((p, i) => [i + 1, p.code, p.name, `XXXX${p.account.slice(-4)}`, p.ifsc, p.mode, rs(p.amount)]),
    foot: [['', '', 'TOTAL', '', '', '', rs(result.totalAmount)]],
    styles: { fontSize: 8 },
  });
  const y = ((doc as any).lastAutoTable?.finalY || 40) + 10;
  if (result.skipped.length) {
    doc.text(`Excluded (${result.skipped.length}): ` + result.skipped.map(s => `${s.name} (${s.reason})`).join('; ').slice(0, 400), 14, y, { maxWidth: 180 });
  }
  const sy = y + 30;
  doc.text('Prepared by: ____________', 14, sy);
  doc.text('Checked by: ____________', 80, sy);
  doc.text('Authorized by: ____________', 140, sy);
  doc.save(`disbursement-authorization-${year}-${String(month).padStart(2, '0')}.pdf`);
};
