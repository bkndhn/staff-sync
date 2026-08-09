import { describe, it, expect } from 'vitest';
import { reconcileSalary, validateSalaryDetail, validateSalaryBatch } from '../utils/salaryValidation';
import { PayrollDetail } from '../types';

const base = (over: Partial<PayrollDetail> = {}): PayrollDetail => {
  const d: PayrollDetail = {
    staffId: 's1',
    month: 5,
    year: 2026,
    presentDays: 26,
    halfDays: 0,
    leaveDays: 0,
    sundayAbsents: 0,
    oldAdv: 0,
    curAdv: 0,
    deduction: 0,
    basicEarned: 10000,
    incentiveEarned: 2000,
    hraEarned: 1000,
    mealAllowance: 0,
    sundayPenalty: 0,
    lateComingDeduction: 0,
    earlyLeaveDeduction: 0,
    grossPayroll: 13000,
    grossSalary: 13000,
    newAdv: 0,
    netPayroll: 13000,
    netSalary: 13000,
    isProcessed: false,
    ...over
  };
  return d;
};

describe('reconcileSalary', () => {
  it('balances a clean payslip', () => {
    const r = reconcileSalary(base());
    expect(r.gross).toBe(13000);
    expect(r.allowanceTotal).toBe(13000);
    expect(r.expectedNet).toBe(13000);
    expect(r.balanced).toBe(true);
  });

  it('includes supplements and meal allowance in gross components', () => {
    const r = reconcileSalary(base({
      mealAllowance: 500,
      salarySupplements: { travel: 300, uniform: 200 },
      grossPayroll: 14000, grossSalary: 14000,
      netPayroll: 14000, netSalary: 14000
    }));
    expect(r.allowanceTotal).toBe(14000);
    expect(r.balanced).toBe(true);
  });

  it('subtracts every deduction type from gross', () => {
    const r = reconcileSalary(base({
      sundayPenalty: 500,
      lateComingDeduction: 200,
      earlyLeaveDeduction: 100,
      curAdv: 1000,
      deduction: 700,
      statutoryTotal: 500,
      netPayroll: 10000, netSalary: 10000
    }));
    expect(r.deductionTotal).toBe(3000);
    expect(r.expectedNet).toBe(10000);
    expect(r.balanced).toBe(true);
  });

  it('floors expected net at zero when deductions exceed gross', () => {
    const r = reconcileSalary(base({ deduction: 20000, netPayroll: 0, netSalary: 0 }));
    expect(r.expectedNet).toBe(0);
    expect(r.balanced).toBe(true);
  });

  it('flags rounding drift larger than tolerance', () => {
    expect(reconcileSalary(base({ netPayroll: 12995, netSalary: 12995 })).balanced).toBe(true);
    expect(reconcileSalary(base({ netPayroll: 12500, netSalary: 12500 })).balanced).toBe(false);
  });
});

describe('validateSalaryDetail', () => {
  const codes = (d: PayrollDetail) => validateSalaryDetail(d).map(i => i.code);

  it('returns no issues for a consistent payslip', () => {
    expect(validateSalaryDetail(base())).toHaveLength(0);
  });

  it('detects missing components', () => {
    expect(codes(base({ netPayroll: undefined, netSalary: undefined }))).toContain('missing_component');
  });

  it('detects negative components', () => {
    expect(codes(base({ hraEarned: -100 }))).toContain('negative_component');
  });

  it('detects gross not matching its components', () => {
    expect(codes(base({ grossPayroll: 15000, grossSalary: 15000, netPayroll: 15000, netSalary: 15000 })))
      .toContain('gross_mismatch');
  });

  it('detects net not matching gross minus deductions', () => {
    expect(codes(base({ sundayPenalty: 500 }))).toContain('net_mismatch');
  });

  it('warns when deductions exceed gross', () => {
    expect(codes(base({ deduction: 20000, netPayroll: 0, netSalary: 0 })))
      .toContain('deductions_exceed_gross');
  });

  it('warns on advance carry-forward mismatch', () => {
    expect(codes(base({ oldAdv: 5000, curAdv: 0, deduction: 1000, newAdv: 9999, netPayroll: 12000, netSalary: 12000 })))
      .toContain('advance_mismatch');
  });

  it('warns when deduction exceeds outstanding advance', () => {
    expect(codes(base({ oldAdv: 100, curAdv: 0, deduction: 1000, newAdv: -900, netPayroll: 12000, netSalary: 12000 })))
      .toContain('over_deduction');
  });

  it('detects statutory total not matching line items', () => {
    expect(codes(base({
      statutoryTotal: 900,
      statutoryBreakdown: [{ key: 'pf', label: 'PF', amount: 500 }],
      netPayroll: 12100, netSalary: 12100
    }))).toContain('statutory_mismatch');
  });

  it('accepts statutory totals that match labelled line items', () => {
    expect(codes(base({
      statutoryTotal: 900,
      statutoryBreakdown: [
        { key: 'pf', label: 'PF', amount: 600 },
        { key: 'esi', label: 'ESI', amount: 300 }
      ],
      netPayroll: 12100, netSalary: 12100
    }))).toHaveLength(0);
  });

  it('warns on unlabelled statutory amounts', () => {
    expect(codes(base({ statutoryTotal: 500, netPayroll: 12500, netSalary: 12500 })))
      .toContain('statutory_unlabelled');
  });

  it('warns on a zero-gross month', () => {
    expect(codes(base({
      basicEarned: 0, incentiveEarned: 0, hraEarned: 0,
      grossPayroll: 0, grossSalary: 0, netPayroll: 0, netSalary: 0
    }))).toContain('zero_gross');
  });
});

describe('validateSalaryBatch', () => {
  it('aggregates errors and warnings across staff', () => {
    const res = validateSalaryBatch(
      [base(), base({ staffId: 's2', sundayPenalty: 500 })],
      id => (id === 's2' ? 'Ravi' : 'Asha')
    );
    expect(res.ok).toBe(false);
    expect(res.errorCount).toBeGreaterThan(0);
    expect(res.issues.every(i => !!i.staffName)).toBe(true);
  });

  it('passes when all payslips reconcile', () => {
    expect(validateSalaryBatch([base(), base({ staffId: 's2' })]).ok).toBe(true);
  });
});
