import { PayrollDetail } from '../types';

export interface SalaryIssue {
  staffId: string;
  staffName?: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface Reconciliation {
  gross: number;
  allowanceTotal: number;
  deductionTotal: number;
  advanceDeduction: number;
  statutoryTotal: number;
  expectedNet: number;
  actualNet: number;
  diff: number;
  balanced: boolean;
}

const n = (v: any): number => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Recompute Gross / deductions / Net from the components of a payroll detail. */
export const reconcileSalary = (detail: PayrollDetail, tolerance = 10): Reconciliation => {
  const supplements = Object.values(detail.salarySupplements || {}).reduce((s, v) => s + n(v), 0);
  const allowanceTotal =
    n(detail.basicEarned) + n(detail.incentiveEarned) + n(detail.hraEarned) +
    supplements + n(detail.mealAllowance);

  const gross = n(detail.grossPayroll ?? detail.grossSalary);

  const advanceDeduction = n(detail.curAdv) + n(detail.deduction);
  const statutoryTotal = n(detail.statutoryTotal);
  const deductionTotal =
    n(detail.sundayPenalty) + n(detail.lateComingDeduction) + n(detail.earlyLeaveDeduction) +
    advanceDeduction + statutoryTotal;

  const expectedNet = Math.max(0, gross - deductionTotal);
  const actualNet = n(detail.netPayroll ?? detail.netSalary);
  const diff = Math.round(actualNet - expectedNet);

  return {
    gross,
    allowanceTotal,
    deductionTotal,
    advanceDeduction,
    statutoryTotal,
    expectedNet,
    actualNet,
    diff,
    balanced: Math.abs(diff) <= tolerance
  };
};

/** Validate one payroll detail; returns blocking errors and non-blocking warnings. */
export const validateSalaryDetail = (
  detail: PayrollDetail,
  staffName?: string,
  tolerance = 10
): SalaryIssue[] => {
  const issues: SalaryIssue[] = [];
  const push = (severity: SalaryIssue['severity'], code: string, message: string) =>
    issues.push({ staffId: detail.staffId, staffName, severity, code, message });

  const numericFields: Array<[string, any]> = [
    ['basicEarned', detail.basicEarned],
    ['incentiveEarned', detail.incentiveEarned],
    ['hraEarned', detail.hraEarned],
    ['grossPayroll', detail.grossPayroll ?? detail.grossSalary],
    ['netPayroll', detail.netPayroll ?? detail.netSalary]
  ];
  numericFields.forEach(([field, value]) => {
    if (value === undefined || value === null) {
      push('error', 'missing_component', `${field} is missing`);
    } else if (typeof value !== 'number' || !isFinite(value)) {
      push('error', 'invalid_component', `${field} is not a valid number`);
    } else if (value < 0) {
      push('error', 'negative_component', `${field} is negative (₹${value})`);
    }
  });

  const rec = reconcileSalary(detail, tolerance);

  if (rec.gross <= 0) {
    push('warning', 'zero_gross', 'Gross is zero for this period');
  }
  if (Math.abs(rec.gross - rec.allowanceTotal) > tolerance) {
    push('error', 'gross_mismatch',
      `Gross ₹${Math.round(rec.gross)} does not match components ₹${Math.round(rec.allowanceTotal)}`);
  }
  if (!rec.balanced) {
    push('error', 'net_mismatch',
      `Net ₹${Math.round(rec.actualNet)} does not match Gross − deductions ₹${Math.round(rec.expectedNet)}`);
  }
  if (rec.deductionTotal > rec.gross) {
    push('warning', 'deductions_exceed_gross', 'Total deductions exceed Gross — Net floored at ₹0');
  }

  const expectedNewAdv = n(detail.oldAdv) + n(detail.curAdv) - n(detail.deduction);
  if (Math.abs(n(detail.newAdv) - expectedNewAdv) > tolerance) {
    push('warning', 'advance_mismatch',
      `New advance ₹${Math.round(n(detail.newAdv))} ≠ old + current − deduction ₹${Math.round(expectedNewAdv)}`);
  }
  if (n(detail.deduction) > n(detail.oldAdv) + n(detail.curAdv) + tolerance) {
    push('warning', 'over_deduction', 'Advance deduction is greater than outstanding advance');
  }

  const stat = detail.statutoryBreakdown || [];
  if (stat.length > 0) {
    const sum = stat.reduce((s, r) => s + n(r.amount), 0);
    if (Math.abs(sum - rec.statutoryTotal) > 1) {
      push('error', 'statutory_mismatch',
        `Statutory total ₹${Math.round(rec.statutoryTotal)} ≠ sum of line items ₹${Math.round(sum)}`);
    }
  } else if (rec.statutoryTotal > 0) {
    push('warning', 'statutory_unlabelled', 'Statutory amount present without labelled line items');
  }

  return issues;
};

export const validateSalaryBatch = (
  details: PayrollDetail[],
  nameOf: (staffId: string) => string | undefined = () => undefined,
  tolerance = 10
): { issues: SalaryIssue[]; errorCount: number; warningCount: number; ok: boolean } => {
  const issues = details.flatMap(d => validateSalaryDetail(d, nameOf(d.staffId), tolerance));
  const errorCount = issues.filter(i => i.severity === 'error').length;
  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    ok: errorCount === 0
  };
};
