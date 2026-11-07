import { describe, it, expect } from 'vitest';
import { hraExemption, otherOldRegimeDeductions, compareRegimes } from '../utils/taxDeclarations';
import { computeTds } from '../utils/tdsCalculations';

describe('tax declarations', () => {
  it('HRA exemption is the least of HRA, rent minus 10% basic, and 40%/50% of basic', () => {
    // basic 3,00,000, HRA 1,50,000, rent 1,80,000 → rent-10% = 1,50,000; 40% = 1,20,000
    expect(hraExemption(300000, 150000, 180000, false)).toBe(120000);
    expect(hraExemption(300000, 150000, 180000, true)).toBe(150000);
    expect(hraExemption(300000, 150000, 0, true)).toBe(0);
  });

  it('caps 80D at 1,00,000, NPS at 50,000 and home-loan interest at 2,00,000', () => {
    expect(otherOldRegimeDeductions({ sec80d: 500000, sec80ccd1b: 90000, sec24b: 400000 })).toBe(350000);
  });

  it('80C plus PF is capped at 1,50,000 and other deductions add on top (old regime only)', () => {
    const old = computeTds({ monthlyGross: 100000, month: 3, year: 2026, regime: 'old', declaredInvestments: 200000, annualPf: 21600, otherDeductions: 50000 });
    expect(old.chapterVIA).toBe(200000);
    const nw = computeTds({ monthlyGross: 100000, month: 3, year: 2026, regime: 'new', declaredInvestments: 200000, otherDeductions: 50000, hraExemption: 99999 });
    expect(nw.chapterVIA).toBe(0);
    expect(nw.taxableIncome).toBe(1200000 - 75000);
  });

  it('recommends old regime only when heavy deductions make it cheaper', () => {
    const monthly = { gross: 150000, basic: 75000, hra: 30000, pf: 1800 };
    expect(compareRegimes(monthly, {}, 3, 2026).better).toBe('new');
    const heavy = compareRegimes(monthly, { sec80c: 150000, sec80d: 50000, sec80ccd1b: 50000, sec24b: 200000, rentPaid: 400000, metroCity: true }, 3, 2026);
    expect(heavy.better).toBe('old');
  });
});
