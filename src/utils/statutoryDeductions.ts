import { Staff, StatutoryDeduction, DeductionBase } from '../types';
import { roundToNearest10 } from './salaryCalculations';

export interface StatutoryDeductionDefinition {
  key: string;
  label: string;
  defaultPercentage: number;
  defaultBase: DeductionBase;
  description: string;
}

/** Government default statutory deductions (employee share). */
export const STATUTORY_DEFINITIONS: StatutoryDeductionDefinition[] = [
  { key: 'esi', label: 'ESI',  defaultPercentage: 0.75, defaultBase: 'gross',     description: 'Employee State Insurance (0.75% of gross)' },
  { key: 'pf',  label: 'PF',   defaultPercentage: 12,   defaultBase: 'basic',     description: 'Provident Fund (12% of basic)' },
  { key: 'pt',  label: 'PT',   defaultPercentage: 0,    defaultBase: 'fixed',     description: 'Professional Tax (state slab — flat amount)' },
  { key: 'tds', label: 'TDS',  defaultPercentage: 10,   defaultBase: 'gross',     description: 'Tax Deducted at Source' },
];

export const isBuiltInDeduction = (key: string) =>
  STATUTORY_DEFINITIONS.some(d => d.key === key);

export const getDeductionLabel = (key: string, cfg?: StatutoryDeduction): string => {
  if (cfg?.name) return cfg.name;
  const def = STATUTORY_DEFINITIONS.find(d => d.key === key);
  return def?.label || key;
};

/** Resolve the rupee value for one deduction line. */
export const computeDeductionAmount = (
  key: string,
  cfg: StatutoryDeduction,
  bases: { basic: number; hra: number; incentive: number; gross: number }
): number => {
  if (!cfg.enabled) return 0;
  
  // ESI: Max gross salary limit is 21,000. If gross > 21000, ESI is not applicable.
  if (key === 'esi' && bases.gross > 21000) {
    return 0;
  }

  if (cfg.base === 'fixed') return Math.max(0, Math.round(cfg.fixedAmount || 0));
  
  let baseValue =
    cfg.base === 'basic' ? bases.basic :
    cfg.base === 'basic_hra' ? bases.basic + bases.hra :
    bases.gross;
    
  // PF: Wage ceiling is 15,000. If base > 15000, PF is calculated on 15,000 max.
  if (key === 'pf' && baseValue > 15000) {
    baseValue = 15000;
  }
  
  const pct = Number(cfg.percentage) || 0;
  return Math.max(0, Math.round((baseValue * pct) / 100));
};

/**
 * Organisation-wide TDS policy. Each client decides whether income tax is
 * deducted at source at all, and whether it follows the statutory slabs
 * (real Income Tax Act computation) or a flat percentage of gross.
 */
export interface TdsPolicy {
  enabled: boolean;
  mode: 'slab' | 'flat';
}

export const DEFAULT_TDS_POLICY: TdsPolicy = { enabled: false, mode: 'slab' };

let runtimeTdsPolicy: TdsPolicy = { ...DEFAULT_TDS_POLICY };

/** Called once after settings load so every payroll calculation uses the same policy. */
export const setRuntimeTdsPolicy = (policy: Partial<TdsPolicy>) => {
  runtimeTdsPolicy = { ...DEFAULT_TDS_POLICY, ...runtimeTdsPolicy, ...policy };
};
export const getRuntimeTdsPolicy = (): TdsPolicy => runtimeTdsPolicy;

export interface BreakdownContext {
  /** 0-indexed payroll month; defaults to the current month. */
  month?: number;
  year?: number;
  /** Override the org-wide policy (used by previews and tests). */
  policy?: TdsPolicy;
}

/** Monthly TDS from the real income-tax slabs for this employee. */
const slabMonthlyTds = (
  staff: Staff,
  bases: { basic: number; hra: number; incentive: number; gross: number },
  pfAmount: number,
  ctx?: BreakdownContext,
): number => {
  const now = new Date();
  const month = ctx?.month ?? now.getMonth();
  const year = ctx?.year ?? now.getFullYear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = ((staff as any).taxProfile || {}) as {
    regime?: string; declaredInvestments?: number; tdsPaidTillDate?: number;
  };
  return computeTds({
    monthlyGross: bases.gross,
    month,
    year,
    regime: profile.regime === 'old' ? 'old' : 'new',
    declaredInvestments: Number(profile.declaredInvestments) || 0,
    annualPf: pfAmount * 12,
    tdsPaidTillDate: Number(profile.tdsPaidTillDate) || 0,
  }).monthlyTds;
};

/** Compute every active statutory deduction for a staff member. */
export const computeStatutoryBreakdown = (
  staff: Staff,
  bases: { basic: number; hra: number; incentive: number; gross: number },
  ctx?: BreakdownContext
): Array<{ key: string; label: string; amount: number; cfg: StatutoryDeduction }> => {
  const map = staff.statutoryDeductions || {};
  const policy = ctx?.policy ?? runtimeTdsPolicy;
  const pfCfg = map['pf'];
  const pfAmount = pfCfg?.enabled ? computeDeductionAmount('pf', pfCfg, bases) : 0;

  const out: Array<{ key: string; label: string; amount: number; cfg: StatutoryDeduction }> = [];
  Object.entries(map).forEach(([key, cfg]) => {
    if (!cfg || !cfg.enabled) return;
    let amount: number;
    if (key === 'tds') {
      if (!policy.enabled) return;
      amount = policy.mode === 'slab'
        ? slabMonthlyTds(staff, bases, pfAmount, ctx)
        : computeDeductionAmount(key, cfg, bases);
    } else {
      amount = computeDeductionAmount(key, cfg, bases);
    }
    if (amount <= 0) return;
    out.push({ key, label: getDeductionLabel(key, cfg), amount, cfg });
  });
  return out;
};

export const sumStatutoryDeductions = (
  staff: Staff,
  bases: { basic: number; hra: number; incentive: number; gross: number },
  ctx?: BreakdownContext
): number => {
  return computeStatutoryBreakdown(staff, bases, ctx).reduce((s, d) => s + d.amount, 0);
};


/** Helper for a fresh default config when user enables a built-in row. */
export const defaultConfigFor = (key: string): StatutoryDeduction => {
  const def = STATUTORY_DEFINITIONS.find(d => d.key === key);
  return {
    enabled: true,
    percentage: def?.defaultPercentage ?? 0,
    base: def?.defaultBase ?? 'gross',
    fixedAmount: 0,
  };
};

export { roundToNearest10 };