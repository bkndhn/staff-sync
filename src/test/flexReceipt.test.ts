import { describe, it, expect } from 'vitest';
import { buildSettlementReceipt } from '../utils/flexBroadcast';

describe('flex settlement receipt', () => {
  it('shows the paid amount in Rs. with Indian grouping', () => {
    const t = buildSettlementReceipt({ name: 'Ravi', date: '2026-10-21', location: 'Main', amount: 1250, method: 'Cash/UPI', receiptNo: 'FX-1' });
    expect(t).toContain('*Paid: Rs. 1,250*');
    expect(t).not.toContain('₹');
  });
  it('includes IN and OUT times when known', () => {
    const t = buildSettlementReceipt({ name: 'Ravi', date: '2026-10-21', location: 'Main', inTime: '2:00 PM', outTime: '9:00 PM', amount: 600, method: 'Cash', receiptNo: 'FX-2' });
    expect(t).toContain('IN 2:00 PM · OUT 9:00 PM');
  });
});
