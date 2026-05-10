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
  cfg: StatutoryDeduction,
  bases: { basic: number; hra: number; incentive: number; gross: number }
): number => {
  if (!cfg.enabled) return 0;
  if (cfg.base === 'fixed') return Math.max(0, Math.round(cfg.fixedAmount || 0));
  const baseValue =
    cfg.base === 'basic' ? bases.basic :
    cfg.base === 'basic_hra' ? bases.basic + bases.hra :
    bases.gross;
  const pct = Number(cfg.percentage) || 0;
  return Math.max(0, Math.round((baseValue * pct) / 100));
};

/** Compute every active statutory deduction for a staff member. */
export const computeStatutoryBreakdown = (
  staff: Staff,
  bases: { basic: number; hra: number; incentive: number; gross: number }
): Array<{ key: string; label: string; amount: number; cfg: StatutoryDeduction }> => {
  const map = staff.statutoryDeductions || {};
  const out: Array<{ key: string; label: string; amount: number; cfg: StatutoryDeduction }> = [];
  Object.entries(map).forEach(([key, cfg]) => {
    if (!cfg || !cfg.enabled) return;
    const amount = computeDeductionAmount(cfg, bases);
    if (amount <= 0) return;
    out.push({ key, label: getDeductionLabel(key, cfg), amount, cfg });
  });
  return out;
};

export const sumStatutoryDeductions = (
  staff: Staff,
  bases: { basic: number; hra: number; incentive: number; gross: number }
): number => {
  return computeStatutoryBreakdown(staff, bases).reduce((s, d) => s + d.amount, 0);
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