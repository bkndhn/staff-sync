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
  skipped: { staffId: string; name: string; reason: string }[];
}

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const net = (d: PayrollDetail) => Math.round(n(d.netPayroll ?? d.netSalary));
const clean = (v?: string | null) => (v || '').replace(/[",\r\n]/g, ' ').trim();
const acc = (v?: string | null) => (v || '').replace(/\s|-/g, '').toUpperCase();

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
