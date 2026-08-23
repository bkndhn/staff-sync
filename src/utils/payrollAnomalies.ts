import { PayrollDetail, Staff } from '../types';

export type AnomalySeverity = 'critical' | 'warning';

export interface PayrollAnomaly {
  code: string;
  severity: AnomalySeverity;
  title: string;
  detail: string;
  staffIds: string[];
}

export interface AnomalyReport {
  anomalies: PayrollAnomaly[];
  criticalCount: number;
  warningCount: number;
  /** true when the run is safe to submit/approve/disburse */
  ok: boolean;
}

const n = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);
const gross = (d: PayrollDetail) => n(d.grossPayroll ?? d.grossSalary);
const net = (d: PayrollDetail) => n(d.netPayroll ?? d.netSalary);
const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;

const normaliseAccount = (v?: string | null) => (v || '').replace(/\s|-/g, '').toUpperCase();

/**
 * Pre-run diagnostic for a payroll period.
 *
 * @param details      salary details for the period being run
 * @param staff        staff master (or snapshot) records
 * @param priorDetails salary details from previous periods, newest first, used
 *                     for spike detection (pass [] to skip that check)
 */
export const detectPayrollAnomalies = (
  details: PayrollDetail[],
  staff: Staff[],
  priorDetails: PayrollDetail[][] = [],
): AnomalyReport => {
  const anomalies: PayrollAnomaly[] = [];
  const staffById = new Map(staff.map(s => [s.id, s]));
  const nameOf = (id: string) => staffById.get(id)?.name || id;
  const push = (a: PayrollAnomaly) => { if (a.staffIds.length) anomalies.push(a); };

  // ── 1. Missing deductions ────────────────────────────────────────────────
  const missingAbsenceDeduction: string[] = [];
  const missingAdvanceRecovery: string[] = [];
  const missingStatutory: string[] = [];

  details.forEach(d => {
    const member = staffById.get(d.staffId);
    if (!member) return;
    const fullSalary = n(member.totalSalary);
    const absentish = n(d.leaveDays) + n(d.halfDays) * 0.5 + n(d.sundayAbsents);

    if (absentish >= 1 && fullSalary > 0 && gross(d) >= fullSalary - 1) {
      missingAbsenceDeduction.push(d.staffId);
    }
    if (n(d.oldAdv) + n(d.curAdv) > 0 && n(d.deduction) === 0) {
      missingAdvanceRecovery.push(d.staffId);
    }
    if (member.isStatutory && gross(d) > 0 && n(d.statutoryTotal) === 0) {
      missingStatutory.push(d.staffId);
    }
  });

  push({
    code: 'missing_absence_deduction',
    severity: 'critical',
    title: 'Absences without a salary deduction',
    detail: `${missingAbsenceDeduction.length} employee(s) have unpaid absences but are paid a full-month gross: ${missingAbsenceDeduction.slice(0, 5).map(nameOf).join(', ')}${missingAbsenceDeduction.length > 5 ? '…' : ''}`,
    staffIds: missingAbsenceDeduction,
  });

  push({
    code: 'missing_advance_recovery',
    severity: 'warning',
    title: 'Outstanding advance with no recovery',
    detail: `${missingAdvanceRecovery.length} employee(s) carry an advance balance but no EMI/deduction is applied this period: ${missingAdvanceRecovery.slice(0, 5).map(nameOf).join(', ')}${missingAdvanceRecovery.length > 5 ? '…' : ''}`,
    staffIds: missingAdvanceRecovery,
  });

  push({
    code: 'missing_statutory',
    severity: 'critical',
    title: 'Statutory employee without ESI/PF',
    detail: `${missingStatutory.length} statutory employee(s) have zero statutory deductions: ${missingStatutory.slice(0, 5).map(nameOf).join(', ')}${missingStatutory.length > 5 ? '…' : ''}`,
    staffIds: missingStatutory,
  });

  // ── 2. Bank detail integrity ─────────────────────────────────────────────
  const byAccount = new Map<string, string[]>();
  const missingBank: string[] = [];

  details.forEach(d => {
    const member = staffById.get(d.staffId);
    if (!member || (member.paymentMode || 'cash') !== 'bank') return;
    const acc = normaliseAccount(member.bankAccountNumber);
    if (!acc || !normaliseAccount(member.ifscCode)) {
      missingBank.push(d.staffId);
      return;
    }
    byAccount.set(acc, [...(byAccount.get(acc) || []), d.staffId]);
  });

  const duplicateAccounts = [...byAccount.entries()].filter(([, ids]) => ids.length > 1);
  push({
    code: 'duplicate_bank_account',
    severity: 'critical',
    title: 'Duplicate bank accounts (ghost-employee risk)',
    detail: duplicateAccounts
      .slice(0, 5)
      .map(([acc, ids]) => `••••${acc.slice(-4)} → ${ids.map(nameOf).join(', ')}`)
      .join(' | '),
    staffIds: duplicateAccounts.flatMap(([, ids]) => ids),
  });

  push({
    code: 'missing_bank_details',
    severity: 'critical',
    title: 'Bank payout without account/IFSC',
    detail: `${missingBank.length} employee(s) are set to bank transfer but have no account number or IFSC: ${missingBank.slice(0, 5).map(nameOf).join(', ')}${missingBank.length > 5 ? '…' : ''}`,
    staffIds: missingBank,
  });

  // ── 3. Pay / overtime spikes vs history ──────────────────────────────────
  const history = new Map<string, number[]>();
  priorDetails.forEach(period => {
    period.forEach(d => {
      history.set(d.staffId, [...(history.get(d.staffId) || []), net(d)]);
    });
  });

  const spikes: string[] = [];
  const spikeLabels: string[] = [];
  const drops: string[] = [];
  const dropLabels: string[] = [];
  details.forEach(d => {
    const past = (history.get(d.staffId) || []).filter(v => v > 0);
    if (past.length === 0) return;
    const avg = past.reduce((s, v) => s + v, 0) / past.length;
    if (avg <= 0) return;
    const current = net(d);
    const label = `${nameOf(d.staffId)} (${inr(avg)} → ${inr(current)})`;
    if (current > avg * 1.5) { spikes.push(d.staffId); spikeLabels.push(label); }
    else if (current > 0 && current < avg * 0.5) { drops.push(d.staffId); dropLabels.push(label); }
  });

  push({
    code: 'pay_spike',
    severity: 'warning',
    title: 'Pay spike vs recent average',
    detail: `${spikes.length} employee(s) are paid over 50% more than their recent average: ${spikeLabels.slice(0, 5).join(', ')}${spikes.length > 5 ? '…' : ''}`,
    staffIds: spikes,
  });

  push({
    code: 'pay_drop',
    severity: 'warning',
    title: 'Unusual pay drop vs recent average',
    detail: `${drops.length} employee(s) are paid less than half their recent average: ${dropLabels.slice(0, 5).join(', ')}${drops.length > 5 ? '…' : ''}`,
    staffIds: drops,
  });


  // ── 4. Sanity checks ─────────────────────────────────────────────────────
  const negativeNet = details.filter(d => net(d) < 0).map(d => d.staffId);
  push({
    code: 'negative_net',
    severity: 'critical',
    title: 'Negative net pay',
    detail: `${negativeNet.length} employee(s) have a negative net salary: ${negativeNet.slice(0, 5).map(nameOf).join(', ')}`,
    staffIds: negativeNet,
  });

  const zeroNet = details.filter(d => net(d) === 0 && gross(d) > 0).map(d => d.staffId);
  push({
    code: 'zero_net',
    severity: 'warning',
    title: 'Zero take-home despite gross earnings',
    detail: `${zeroNet.length} employee(s) net to ₹0 after deductions: ${zeroNet.slice(0, 5).map(nameOf).join(', ')}`,
    staffIds: zeroNet,
  });

  const criticalCount = anomalies.filter(a => a.severity === 'critical').length;
  return {
    anomalies,
    criticalCount,
    warningCount: anomalies.length - criticalCount,
    ok: criticalCount === 0,
  };
};
