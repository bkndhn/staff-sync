/**
 * Automated TDS (income tax at source) computation for payroll runs.
 *
 * Uses the New Tax Regime slabs (default regime, FY 2025-26 onwards) and the
 * Old Regime slabs when a staff member has opted out. Everything is projected
 * annually from the monthly payroll figures and divided across the remaining
 * months of the financial year, which is how Indian payroll TDS works.
 */
import { Staff, PayrollDetail } from '../types';

export type TaxRegime = 'new' | 'old';

export interface TaxSlab {
  upTo: number | null; // null = no upper bound
  rate: number; // percentage
}

/** New regime (default) slabs, FY 2025-26. */
export const NEW_REGIME_SLABS: TaxSlab[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 5 },
  { upTo: 1200000, rate: 10 },
  { upTo: 1600000, rate: 15 },
  { upTo: 2000000, rate: 20 },
  { upTo: 2400000, rate: 25 },
  { upTo: null, rate: 30 },
];

/** Old regime slabs (below 60 years). */
export const OLD_REGIME_SLABS: TaxSlab[] = [
  { upTo: 250000, rate: 0 },
  { upTo: 500000, rate: 5 },
  { upTo: 1000000, rate: 20 },
  { upTo: null, rate: 30 },
];

export const STANDARD_DEDUCTION = { new: 75000, old: 50000 } as const;
/** Section 87A rebate: full tax rebate below this taxable income. */
export const REBATE_87A = {
  new: { limit: 1200000, max: 60000 },
  old: { limit: 500000, max: 12500 },
} as const;
export const CESS_RATE = 4;

const r0 = (v: number) => Math.max(0, Math.round(v));

export const slabTax = (taxableIncome: number, regime: TaxRegime): number => {
  const slabs = regime === 'old' ? OLD_REGIME_SLABS : NEW_REGIME_SLABS;
  let remaining = Math.max(0, taxableIncome);
  let previous = 0;
  let tax = 0;
  for (const slab of slabs) {
    const ceiling = slab.upTo ?? Number.POSITIVE_INFINITY;
    const band = Math.min(remaining, ceiling - previous);
    if (band <= 0) break;
    tax += (band * slab.rate) / 100;
    remaining -= band;
    previous = ceiling;
    if (remaining <= 0) break;
  }
  return tax;
};

export const surcharge = (tax: number, taxableIncome: number, regime: TaxRegime): number => {
  let rate = 0;
  if (taxableIncome > 20000000) rate = regime === 'new' ? 25 : 37;
  else if (taxableIncome > 10000000) rate = 15;
  else if (taxableIncome > 5000000) rate = 10;
  return (tax * rate) / 100;
};

export interface TdsInput {
  /** Gross earnings for the month (before deductions). */
  monthlyGross: number;
  /** Month index 0-11 of the payroll period. */
  month: number;
  year: number;
  regime?: TaxRegime;
  /** Chapter VI-A investments declared (old regime only). */
  declaredInvestments?: number;
  /** Employee PF contribution for the year (old regime 80C). */
  annualPf?: number;
  /** TDS already deducted earlier in this financial year. */
  tdsPaidTillDate?: number;
  /** Old regime: 80D, 80CCD(1B), 24(b), 80E, 80G already capped (added on top of 80C). */
  otherDeductions?: number;
  /** Old regime: annual HRA exemption u/s 10(13A). */
  hraExemption?: number;
}

export interface TdsResult {
  regime: TaxRegime;
  annualGross: number;
  standardDeduction: number;
  chapterVIA: number;
  taxableIncome: number;
  slabTax: number;
  rebate87A: number;
  surcharge: number;
  cess: number;
  annualTax: number;
  tdsPaidTillDate: number;
  remainingMonths: number;
  monthlyTds: number;
}

/** Months left in the Indian financial year (Apr-Mar) including the current one. */
export const remainingFyMonths = (month: number): number => {
  const idx = month >= 3 ? month - 3 : month + 9; // 0 = April
  return Math.max(1, 12 - idx);
};

export const financialYearLabel = (month: number, year: number): string => {
  const start = month >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

export const computeTds = (input: TdsInput): TdsResult => {
  const regime: TaxRegime = input.regime || 'new';
  const monthlyGross = Math.max(0, Number(input.monthlyGross) || 0);
  const annualGross = monthlyGross * 12;
  const standardDeduction = Math.min(STANDARD_DEDUCTION[regime], annualGross);
  const chapterVIA =
    regime === 'old'
      ? Math.min(150000, (Number(input.declaredInvestments) || 0) + (Number(input.annualPf) || 0))
        + Math.max(0, Number(input.otherDeductions) || 0)
      : 0;
  const hraExempt = regime === 'old' ? Math.max(0, Number(input.hraExemption) || 0) : 0;

  const taxableIncome = Math.max(0, annualGross - standardDeduction - chapterVIA - hraExempt);
  const base = slabTax(taxableIncome, regime);
  const rebateCfg = REBATE_87A[regime];
  const rebate = taxableIncome <= rebateCfg.limit ? Math.min(base, rebateCfg.max) : 0;
  const afterRebate = Math.max(0, base - rebate);
  const sur = surcharge(afterRebate, taxableIncome, regime);
  const cess = ((afterRebate + sur) * CESS_RATE) / 100;
  const annualTax = r0(afterRebate + sur + cess);

  const tdsPaidTillDate = Math.max(0, Number(input.tdsPaidTillDate) || 0);
  const remaining = remainingFyMonths(input.month);
  const monthlyTds = r0((annualTax - tdsPaidTillDate) / remaining);

  return {
    regime,
    annualGross: r0(annualGross),
    standardDeduction: r0(standardDeduction),
    chapterVIA: r0(chapterVIA),
    taxableIncome: r0(taxableIncome),
    slabTax: r0(base),
    rebate87A: r0(rebate),
    surcharge: r0(sur),
    cess: r0(cess),
    annualTax,
    tdsPaidTillDate,
    remainingMonths: remaining,
    monthlyTds,
  };
};

export const grossOf = (d: PayrollDetail): number =>
  Math.round(Number(d.grossPayroll ?? d.grossSalary ?? 0) || 0);

export interface StaffTdsRow {
  staff: Staff;
  detail: PayrollDetail;
  tds: TdsResult;
}

/** Compute TDS for every staff member in a payroll run. */
export const computeRunTds = (
  details: PayrollDetail[],
  staff: Staff[],
  month: number,
  year: number,
): StaffTdsRow[] => {
  const byId = new Map(staff.map(s => [s.id, s]));
  const rows: StaffTdsRow[] = [];
  details.forEach(detail => {
    const member = byId.get(detail.staffId);
    if (!member) return;
    const cfg = taxProfileOf(member);
    const pfLine = (detail.statutoryBreakdown || []).find(b => b.key === 'pf');
    rows.push({
      staff: member,
      detail,
      tds: computeTds({
        monthlyGross: grossOf(detail),
        month,
        year,
        regime: cfg.regime === 'old' ? 'old' : 'new',
        declaredInvestments: Number(cfg.declaredInvestments) || 0,
        annualPf: (pfLine?.amount || 0) * 12,
        tdsPaidTillDate: Number(cfg.tdsPaidTillDate) || 0,
        otherDeductions: Number(cfg.otherDeductions) || 0,
        hraExemption: Number(cfg.hraExemption) || 0,
      }),
    });
  });
  return rows;
};

// ── Approved employee tax declarations (current FY), loaded by taxDeclarationService ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RuntimeTaxProfile = { regime?: string; declaredInvestments?: number; otherDeductions?: number; hraExemption?: number; tdsPaidTillDate?: number };
let approvedProfiles = new Map<string, RuntimeTaxProfile>();
export const setApprovedTaxProfiles = (m: Map<string, RuntimeTaxProfile>) => { approvedProfiles = m; };
/** Approved declaration wins; falls back to any legacy taxProfile on the staff record. */
export const taxProfileOf = (member: Staff): RuntimeTaxProfile =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approvedProfiles.get(member.id) || (member as any).taxProfile || {};
