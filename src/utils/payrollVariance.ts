import { PayrollDetail, Staff } from '../types';

export interface VarianceStep {
  key: string;
  label: string;
  amount: number; // signed contribution to the change
}

export interface VarianceReport {
  previousTotal: number;
  currentTotal: number;
  change: number;
  changePercent: number;
  steps: VarianceStep[];
  joiners: { staffId: string; name: string; amount: number }[];
  leavers: { staffId: string; name: string; amount: number }[];
  previousHeadcount: number;
  currentHeadcount: number;
}

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const net = (d: PayrollDetail) => n(d.netPayroll ?? d.netSalary);

const component = (d: PayrollDetail, key: string): number => {
  switch (key) {
    case 'basic': return n(d.basicEarned);
    case 'incentive': return n(d.incentiveEarned);
    case 'hra': return n(d.hraEarned);
    case 'meal': return n(d.mealAllowance);
    case 'supplements':
      return Object.values(d.salarySupplements || {}).reduce((s, v) => s + n(v), 0);
    case 'advance': return -n(d.deduction);
    case 'sundayPenalty': return -n(d.sundayPenalty);
    case 'late': return -n(d.lateComingDeduction);
    case 'early': return -n(d.earlyLeaveDeduction);
    case 'statutory': return -n(d.statutoryTotal);
    default: return 0;
  }
};

const COMPONENTS: { key: string; label: string }[] = [
  { key: 'basic', label: 'Basic earned' },
  { key: 'incentive', label: 'Incentive' },
  { key: 'hra', label: 'HRA' },
  { key: 'meal', label: 'Meal allowance' },
  { key: 'supplements', label: 'Other allowances' },
  { key: 'advance', label: 'Advance / EMI recovery' },
  { key: 'sundayPenalty', label: 'Sunday penalty' },
  { key: 'late', label: 'Late-coming deduction' },
  { key: 'early', label: 'Early-leave deduction' },
  { key: 'statutory', label: 'Statutory deductions' },
];

/**
 * Builds a waterfall explaining the movement in net payout between two periods.
 * Headcount effects (joiners / leavers) are isolated first, then the remaining
 * change is attributed to individual salary components for continuing staff.
 */
export const buildPayrollVariance = (
  current: PayrollDetail[],
  previous: PayrollDetail[],
  staff: Staff[] = [],
): VarianceReport => {
  const nameOf = (id: string) => staff.find(s => s.id === id)?.name || id;
  const prevById = new Map(previous.map(d => [d.staffId, d]));
  const currById = new Map(current.map(d => [d.staffId, d]));

  const previousTotal = previous.reduce((s, d) => s + net(d), 0);
  const currentTotal = current.reduce((s, d) => s + net(d), 0);

  const joiners = current
    .filter(d => !prevById.has(d.staffId))
    .map(d => ({ staffId: d.staffId, name: nameOf(d.staffId), amount: net(d) }));

  const leavers = previous
    .filter(d => !currById.has(d.staffId))
    .map(d => ({ staffId: d.staffId, name: nameOf(d.staffId), amount: -net(d) }));

  const steps: VarianceStep[] = [];

  if (joiners.length) {
    steps.push({
      key: 'joiners',
      label: `New / returning staff (${joiners.length})`,
      amount: joiners.reduce((s, j) => s + j.amount, 0),
    });
  }
  if (leavers.length) {
    steps.push({
      key: 'leavers',
      label: `Exited staff (${leavers.length})`,
      amount: leavers.reduce((s, l) => s + l.amount, 0),
    });
  }

  const continuing = current.filter(d => prevById.has(d.staffId));
  COMPONENTS.forEach(({ key, label }) => {
    const delta = continuing.reduce((sum, d) => {
      const prev = prevById.get(d.staffId)!;
      return sum + (component(d, key) - component(prev, key));
    }, 0);
    if (Math.abs(delta) >= 1) steps.push({ key, label, amount: delta });
  });

  // Residual so the waterfall always reconciles to the actual change.
  const change = currentTotal - previousTotal;
  const explained = steps.reduce((s, st) => s + st.amount, 0);
  const residual = change - explained;
  if (Math.abs(residual) >= 1) {
    steps.push({ key: 'other', label: 'Other adjustments', amount: residual });
  }

  return {
    previousTotal,
    currentTotal,
    change,
    changePercent: previousTotal > 0 ? (change / previousTotal) * 100 : 0,
    steps: steps.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    joiners,
    leavers,
    previousHeadcount: previous.length,
    currentHeadcount: current.length,
  };
};
