/**
 * Employee tax declarations (Old vs New regime) — pure rules, unit-tested.
 * Approved declarations feed payroll TDS through setApprovedTaxProfiles().
 */
import { computeTds, type TaxRegime, type TdsResult } from './tdsCalculations';

export interface DeclarationItems {
  sec80c?: number;        // LIC, PPF, ELSS, tuition fees, home-loan principal (PF added automatically)
  sec80d?: number;        // Health insurance premiums
  sec80ccd1b?: number;    // Extra NPS contribution
  sec24b?: number;        // Home-loan interest (self-occupied)
  sec80e?: number;        // Education-loan interest
  sec80g?: number;        // Eligible donations (qualifying amount)
  rentPaid?: number;      // Annual rent paid, for HRA exemption
  metroCity?: boolean;    // Rent in Delhi/Mumbai/Kolkata/Chennai → 50% of basic
}

export const LIMITS = {
  sec80c: 150000,
  sec80d: 100000,
  sec80ccd1b: 50000,
  sec24b: 200000,
} as const;

const n = (v: unknown) => Math.max(0, Number(v) || 0);

/** HRA exemption u/s 10(13A): least of HRA received, rent − 10% basic, 50%/40% of basic. */
export const hraExemption = (annualBasic: number, annualHra: number, rentPaid: number, metro: boolean): number => {
  if (rentPaid <= 0 || annualHra <= 0) return 0;
  return Math.round(Math.max(0, Math.min(annualHra, rentPaid - 0.1 * annualBasic, (metro ? 0.5 : 0.4) * annualBasic)));
};

/** Old-regime deductions other than 80C (which computeTds caps together with PF). */
export const otherOldRegimeDeductions = (items: DeclarationItems): number =>
  Math.min(n(items.sec80d), LIMITS.sec80d) +
  Math.min(n(items.sec80ccd1b), LIMITS.sec80ccd1b) +
  Math.min(n(items.sec24b), LIMITS.sec24b) +
  n(items.sec80e) +
  n(items.sec80g);

export interface TaxProfile {
  regime: TaxRegime;
  declaredInvestments: number;
  otherDeductions: number;
  rentPaid: number;
  metroCity: boolean;
}

export const profileFromDeclaration = (regime: TaxRegime, items: DeclarationItems): TaxProfile => ({
  regime,
  declaredInvestments: n(items.sec80c),
  otherDeductions: otherOldRegimeDeductions(items),
  rentPaid: n(items.rentPaid),
  metroCity: !!items.metroCity,
});

/** Annual tax under both regimes, so staff can pick the cheaper one. */
export const compareRegimes = (
  monthly: { gross: number; basic: number; hra: number; pf: number },
  items: DeclarationItems,
  month: number,
  year: number,
): { old: TdsResult; new: TdsResult; better: TaxRegime; saving: number } => {
  const run = (regime: TaxRegime) => {
    const p = profileFromDeclaration(regime, items);
    return computeTds({
      monthlyGross: monthly.gross, month, year, regime,
      declaredInvestments: p.declaredInvestments,
      annualPf: monthly.pf * 12,
      otherDeductions: p.otherDeductions,
      hraExemption: hraExemption(monthly.basic * 12, monthly.hra * 12, p.rentPaid, p.metroCity),
    });
  };
  const o = run('old');
  const nw = run('new');
  const better: TaxRegime = o.annualTax < nw.annualTax ? 'old' : 'new';
  return { old: o, new: nw, better, saving: Math.abs(o.annualTax - nw.annualTax) };
};

// ── Runtime registry of approved declarations (current FY), used by payroll ──
let approved = new Map<string, TaxProfile>();
export const setApprovedTaxProfiles = (m: Map<string, TaxProfile>) => { approved = m; };
export const approvedTaxProfile = (staffId: string): TaxProfile | undefined => approved.get(staffId);
