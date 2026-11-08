// Salary payout batches: create → approve (different person) → export bank file → confirm with UTR.
import { dataApi } from '../lib/dataApi';
import type { BankFormat } from '../utils/bankExport';
import type { BatchStatus, PayoutLine } from '../utils/payoutBatch';
import { salaryDisbursementService } from './salaryDisbursementService';

export interface PayoutBatch {
  id: string; month: number; year: number; status: BatchStatus; bankFormat: BankFormat;
  debitAccount: string; totalAmount: number; payeeCount: number;
  createdBy?: string | null; approvedBy?: string | null; approvedAt?: string | null;
  exportedAt?: string | null; completedAt?: string | null; createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const batchFrom = (r: any): PayoutBatch => ({
  id: r.id, month: r.month, year: r.year, status: r.status, bankFormat: r.bank_format, debitAccount: r.debit_account || '',
  totalAmount: Number(r.total_amount) || 0, payeeCount: r.payee_count || 0, createdBy: r.created_by, approvedBy: r.approved_by,
  approvedAt: r.approved_at, exportedAt: r.exported_at, completedAt: r.completed_at, createdAt: r.created_at,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lineFrom = (r: any): PayoutLine => ({
  id: r.id, staffId: r.staff_id, staffName: r.staff_name || '', netAmount: Number(r.net_amount) || 0,
  bankAccountNumber: r.bank_account_number, ifscCode: r.ifsc_code, paymentMode: r.payment_mode,
  status: r.status, utrRef: r.utr_ref, failureReason: r.failure_reason,
});
const fail = (e: { message?: string } | null, msg: string) => { if (e) throw new Error(e.message || msg); };

export const payoutBatchService = {
  async list(month: number, year: number): Promise<PayoutBatch[]> {
    const { data, error } = await dataApi.from('payout_batches').select('*').eq('month', month).eq('year', year);
    fail(error, 'Could not load payout batches');
    return ((data as unknown[]) || []).map(batchFrom).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async lines(batchId: string): Promise<PayoutLine[]> {
    const { data, error } = await dataApi.from('payout_batch_items').select('*').eq('batch_id', batchId);
    fail(error, 'Could not load payout lines');
    return ((data as unknown[]) || []).map(lineFrom);
  },
  /** Staff already in an active batch for this month (duplicate guard; the DB also enforces it). */
  async queuedStaff(month: number, year: number): Promise<Set<string>> {
    const { data, error } = await dataApi.from('payout_batch_items').select('staff_id,active').eq('month', month).eq('year', year);
    fail(error, 'Could not check existing payouts');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Set(((data as any[]) || []).filter(r => r.active).map(r => r.staff_id));
  },
  async create(month: number, year: number, format: BankFormat, debitAccount: string, lines: PayoutLine[]): Promise<void> {
    const total = lines.reduce((s, l) => s + l.netAmount, 0);
    const { data, error } = await dataApi.from('payout_batches')
      .insert({ month, year, bank_format: format, debit_account: debitAccount, total_amount: total, payee_count: lines.length }).select('id');
    fail(error, 'Could not create batch');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = ((data as any[]) || [])[0]?.id;
    if (!id) throw new Error('Could not create batch');
    const { error: e2 } = await dataApi.from('payout_batch_items').insert(lines.map(l => ({
      batch_id: id, staff_id: l.staffId, month, year, staff_name: l.staffName, net_amount: l.netAmount,
      bank_account_number: l.bankAccountNumber, ifsc_code: l.ifscCode, payment_mode: l.paymentMode,
    })));
    if (e2) {
      await dataApi.from('payout_batches').update({ status: 'Cancelled', cancelled_reason: 'Lines rejected' }).eq('id', id);
      throw new Error(/duplicate|unique/i.test(e2.message || '') ? 'Someone in this batch is already in another payout batch for this month.' : e2.message || 'Could not add payout lines');
    }
  },
  async setStatus(id: string, status: BatchStatus, reason?: string): Promise<void> {
    const { error } = await dataApi.from('payout_batches').update({ status, ...(reason ? { cancelled_reason: reason } : {}) }).eq('id', id);
    fail(error, 'Could not update batch');
  },
  async markExported(batchId: string): Promise<void> {
    await this.setStatus(batchId, 'Exported').catch(e => { if (!/Exported to Exported|from Exported/.test(String(e.message))) throw e; });
    const { error } = await dataApi.from('payout_batch_items').update({ status: 'Exported' }).eq('batch_id', batchId).eq('status', 'Pending');
    fail(error, 'Could not update lines');
  },
  async confirmLine(line: PayoutLine, month: number, year: number, outcome: 'Paid' | 'Failed', ref: string): Promise<void> {
    const { error } = await dataApi.from('payout_batch_items')
      .update(outcome === 'Paid' ? { status: 'Paid', utr_ref: ref.trim() } : { status: 'Failed', failure_reason: ref.trim() || 'Bank returned' })
      .eq('id', line.id!);
    fail(error, 'Could not update line');
    if (outcome === 'Paid') {
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;
      await salaryDisbursementService.markAsPaidAndNotify(line.staffId, monthYear, line.netAmount, line.paymentMode, ref.trim(), 'Bank payout batch');
    }
  },
};
