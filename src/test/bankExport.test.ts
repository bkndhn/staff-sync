import { describe, it, expect } from 'vitest';
import { isValidIfsc, isValidAccount, buildBankPaymentFile } from '../utils/bankExport';

describe('disbursement batch validation', () => {
  it('accepts a correct IFSC and rejects a malformed one', () => {
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
  });
  it('requires 9–18 digit account numbers', () => {
    expect(isValidAccount('12345678')).toBe(false);
    expect(isValidAccount('123456789012')).toBe(true);
  });
  it('excludes staff with an invalid IFSC from the bank file', () => {
    const staff: any[] = [
      { id: 'a', name: 'Good', paymentMode: 'bank', bankAccountNumber: '123456789012', ifscCode: 'SBIN0000123' },
      { id: 'b', name: 'Bad', paymentMode: 'bank', bankAccountNumber: '123456789012', ifscCode: 'SBIN123' },
    ];
    const r = buildBankPaymentFile([{ staffId: 'a', netSalary: 1000 }, { staffId: 'b', netSalary: 1000 }] as any, staff, 8, 2026, { format: 'generic' });
    expect(r.rowCount).toBe(1);
    expect(r.skipped[0].name).toBe('Bad');
  });
});
