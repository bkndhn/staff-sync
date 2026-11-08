import { describe, it, expect } from 'vitest';
import { planPayoutBatch, exportApprovedBatch, canApprove, canMarkPaid, canComplete } from '../utils/payoutBatch';

const staff: any[] = [
  { id: 'a', name: 'Asha', paymentMode: 'bank', bankAccountNumber: '123456789012', ifscCode: 'HDFC0001234' },
  { id: 'b', name: 'Bala', paymentMode: 'bank', bankAccountNumber: '123', ifscCode: 'HDFC0001234' },
  { id: 'c', name: 'Chitra', paymentMode: 'bank', bankAccountNumber: '987654321098', ifscCode: 'SBIN0000123' },
];
const details: any[] = [{ staffId: 'a', netSalary: 20000 }, { staffId: 'b', netSalary: 15000 }, { staffId: 'c', netSalary: 18000 }];

describe('salary payout batches', () => {
  it('skips invalid bank details and anyone already in an active batch this month', () => {
    const p = planPayoutBatch(details, staff, 11, 2026, new Set(['c']));
    expect(p.lines.map(l => l.staffId)).toEqual(['a']);
    expect(p.total).toBe(20000);
    expect(p.skipped.map(s => s.name).sort()).toEqual(['Bala', 'Chitra']);
  });
  it('refuses to build a bank file before approval', () => {
    const { lines } = planPayoutBatch(details, staff, 11, 2026, new Set());
    expect(() => exportApprovedBatch('Draft', lines, 11, 2026, 'generic', '')).toThrow(/approved/);
    expect(exportApprovedBatch('Approved', lines, 11, 2026, 'generic', '').totalAmount).toBe(38000);
  });
  it('the creator cannot approve their own batch', () => {
    expect(canApprove('Draft', 'me@x.com', 'me@x.com')).toBe(false);
    expect(canApprove('Draft', 'me@x.com', 'boss@x.com')).toBe(true);
    expect(canApprove('Approved', 'me@x.com', 'boss@x.com')).toBe(false);
  });
  it('exporting does not mark paid; a line needs a bank reference after export', () => {
    expect(canMarkPaid('Approved', 'Pending', 'UTR123456')).toBe(false);
    expect(canMarkPaid('Exported', 'Exported', '')).toBe(false);
    expect(canMarkPaid('Exported', 'Exported', 'UTR123456')).toBe(true);
    expect(canComplete('Exported', [{ status: 'Exported' } as any])).toBe(false);
    expect(canComplete('Exported', [{ status: 'Paid' } as any, { status: 'Failed' } as any])).toBe(true);
  });
});
