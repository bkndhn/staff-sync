/**
 * Salary payout batches — pure rules (unit-tested). The database enforces the
 * same rules again (payout_batch_guard / payout_item_guard triggers).
 */
import type { PayrollDetail, Staff } from '../types';
import { buildBankPaymentFile, type BankFormat, type BankExportResult } from './bankExport';

export type BatchStatus = 'Draft' | 'Approved' | 'Exported' | 'Completed' | 'Cancelled';
export type LineStatus = 'Pending' | 'Exported' | 'Paid' | 'Failed';

export interface PayoutLine {
  id?: string;
  staffId: string;
  staffName: string;
  netAmount: number;
  bankAccountNumber: string;
  ifscCode: string;
  paymentMode: string;
  status: LineStatus;
  utrRef?: string | null;
  failureReason?: string | null;
}

export interface BatchPlan {
  lines: PayoutLine[];
  total: number;
  skipped: { staffId: string; name: string; reason: string }[];
}

/**
 * Builds the lines for a new batch from the payroll run. Staff already in an
 * active (not cancelled / not failed) batch for this month are skipped so the
 * same salary can never go out twice.
 */
export const planPayoutBatch = (
  details: PayrollDetail[], staff: Staff[], month: number, year: number, alreadyQueued: Set<string>,
): BatchPlan => {
  const file = buildBankPaymentFile(details, staff, month, year, { format: 'generic' });
  const skipped = [...file.skipped];
  const lines: PayoutLine[] = [];
  for (const p of file.payees) {
    if (alreadyQueued.has(p.staffId)) {
      skipped.push({ staffId: p.staffId, name: p.name, reason: 'Already in another payout batch for this month' });
      continue;
    }
    lines.push({ staffId: p.staffId, staffName: p.name, netAmount: p.amount, bankAccountNumber: p.account, ifscCode: p.ifsc, paymentMode: p.mode, status: 'Pending' });
  }
  return { lines, total: lines.reduce((s, l) => s + l.netAmount, 0), skipped };
};

/** Bank file built only from the frozen, approved lines — never from live staff records. */
export const exportApprovedBatch = (
  status: BatchStatus, lines: PayoutLine[], month: number, year: number, format: BankFormat, debitAccount: string,
): BankExportResult => {
  if (status !== 'Approved' && status !== 'Exported') throw new Error('Batch must be approved before the bank file can be downloaded');
  const live = lines.filter(l => l.status === 'Pending' || l.status === 'Exported');
  const staff = live.map(l => ({ id: l.staffId, name: l.staffName, paymentMode: 'bank', bankAccountNumber: l.bankAccountNumber, ifscCode: l.ifscCode })) as unknown as Staff[];
  const details = live.map(l => ({ staffId: l.staffId, netSalary: l.netAmount })) as unknown as PayrollDetail[];
  return buildBankPaymentFile(details, staff, month, year, { format, debitAccount });
};

export const canApprove = (status: BatchStatus, createdBy: string | null | undefined, me: string) =>
  status === 'Draft' && !!me && me !== createdBy;

/** Only a bank reference (UTR) proves money moved; exporting never marks anything paid. */
export const canMarkPaid = (batch: BatchStatus, line: LineStatus, utr: string) =>
  batch === 'Exported' && (line === 'Exported' || line === 'Pending') && utr.trim().length >= 6;

export const canComplete = (batch: BatchStatus, lines: PayoutLine[]) =>
  batch === 'Exported' && lines.every(l => l.status === 'Paid' || l.status === 'Failed');
