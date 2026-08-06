import { dataApi } from '../lib/dataApi';
import { advanceEntryService } from './advanceEntryService';
import { appSettingsService } from './appSettingsService';
import { auditLogService } from './auditLogService';
import { currentActor } from '../lib/currentActor';


export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LoanApprovalStep {
  level: number;
  action: 'approved' | 'rejected';
  by: string;
  role: string;
  comment?: string;
  at: string;
}

export interface LoanRequest {
  id: string;
  staffId: string;
  staffName?: string;
  location?: string;
  floor?: string;
  amount: number;
  reason: string;
  emiMonths: number;
  startMonth: number;
  startYear: number;
  status: LoanStatus;
  currentApprovalLevel: number;
  requiredApprovalLevels: number;
  approvalHistory: LoanApprovalStep[];
  rejectionReason?: string;
  advanceEntryId?: string;
  approvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LoanThresholds {
  /** Loans up to this amount need only a single (manager-level) approval. */
  managerMaxAmount: number;
  /** Loans above managerMaxAmount need manager + admin (2 levels). */
  adminMaxAmount: number;
  /** Maximum EMI months a staff member may choose. */
  maxEmiMonths: number;
}

export const DEFAULT_LOAN_THRESHOLDS: LoanThresholds = {
  managerMaxAmount: 10000,
  adminMaxAmount: 100000,
  maxEmiMonths: 12,
};

const SETTINGS_KEY = 'loan_approval_thresholds';

function mapFromDb(row: any): LoanRequest {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name ?? undefined,
    location: row.location ?? undefined,
    floor: row.floor ?? undefined,
    amount: Number(row.amount),
    reason: row.reason,
    emiMonths: row.emi_months ?? 1,
    startMonth: row.start_month,
    startYear: row.start_year,
    status: row.status,
    currentApprovalLevel: row.current_approval_level ?? 1,
    requiredApprovalLevels: row.required_approval_levels ?? 1,
    approvalHistory: Array.isArray(row.approval_history) ? row.approval_history : [],
    rejectionReason: row.rejection_reason ?? undefined,
    advanceEntryId: row.advance_entry_id ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

/** Monthly instalment for a loan (last instalment absorbs any rounding remainder). */
export function emiAmount(amount: number, months: number): number {
  if (!months || months < 1) return amount;
  return Math.round(amount / months);
}

/** Schedule of instalments derived from the linked advance entry state. */
export function buildSchedule(loan: LoanRequest, totalDeducted = 0) {
  const per = emiAmount(loan.amount, loan.emiMonths);
  const rows: { month: number; year: number; amount: number; paid: boolean }[] = [];
  let remaining = loan.amount;
  let paidPool = totalDeducted;
  for (let i = 0; i < loan.emiMonths; i++) {
    const m = (loan.startMonth + i) % 12;
    const y = loan.startYear + Math.floor((loan.startMonth + i) / 12);
    const amt = i === loan.emiMonths - 1 ? remaining : Math.min(per, remaining);
    remaining -= amt;
    const paid = paidPool >= amt - 0.001;
    if (paid) paidPool -= amt;
    rows.push({ month: m, year: y, amount: amt, paid });
  }
  return rows;
}

export const loanService = {
  async getThresholds(): Promise<LoanThresholds> {
    try {
      const raw = await appSettingsService.getSetting(SETTINGS_KEY);
      if (!raw) return DEFAULT_LOAN_THRESHOLDS;
      return { ...DEFAULT_LOAN_THRESHOLDS, ...JSON.parse(raw) };
    } catch {
      return DEFAULT_LOAN_THRESHOLDS;
    }
  },

  async saveThresholds(t: LoanThresholds): Promise<boolean> {
    try {
      await appSettingsService.setSetting(SETTINGS_KEY, JSON.stringify(t));
      return true;
    } catch (e) {
      console.error('Error saving loan thresholds:', e);
      return false;
    }
  },

  /** How many approval levels an amount requires under the configured thresholds. */
  requiredLevels(amount: number, t: LoanThresholds): number {
    if (amount <= t.managerMaxAmount) return 1;
    return 2;
  },

  async getByStaff(staffId: string): Promise<LoanRequest[]> {
    const { data, error } = await dataApi
      .from('loan_requests')
      .select('*')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching loan requests:', error);
      return [];
    }
    return (data || []).map(mapFromDb);
  },

  async getAll(): Promise<LoanRequest[]> {
    const { data, error } = await dataApi
      .from('loan_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching loan requests:', error);
      return [];
    }
    return (data || []).map(mapFromDb);
  },

  async create(input: {
    staffId: string;
    staffName?: string;
    location?: string;
    floor?: string;
    amount: number;
    reason: string;
    emiMonths: number;
    startMonth: number;
    startYear: number;
  }): Promise<LoanRequest | null> {
    const thresholds = await loanService.getThresholds();
    if (input.amount > thresholds.adminMaxAmount) {
      throw new Error(`Maximum loan amount is ₹${thresholds.adminMaxAmount.toLocaleString('en-IN')}`);
    }
    if (input.emiMonths > thresholds.maxEmiMonths) {
      throw new Error(`Maximum ${thresholds.maxEmiMonths} EMI months allowed`);
    }
    const { data, error } = await dataApi
      .from('loan_requests')
      .insert({
        staff_id: input.staffId,
        staff_name: input.staffName ?? null,
        location: input.location ?? null,
        floor: input.floor ?? null,
        amount: input.amount,
        reason: input.reason,
        emi_months: input.emiMonths,
        start_month: input.startMonth,
        start_year: input.startYear,
        status: 'pending',
        current_approval_level: 1,
        required_approval_levels: loanService.requiredLevels(input.amount, thresholds),
        approval_history: [],
      })
      .select()
      .single();
    if (error) {
      console.error('Error creating loan request:', error);
      throw new Error(error.message);
    }
    const created = mapFromDb(data);
    await auditLogService.log({
      action: 'loan_request',
      staffId: created.staffId,
      staffName: created.staffName,
      details: `Loan request of ₹${created.amount.toLocaleString('en-IN')} over ${created.emiMonths} EMI month(s) submitted — reason: ${created.reason}`,
      performedBy: currentActor().name,
      after: { amount: created.amount, emi_months: created.emiMonths, status: created.status },
    }).catch(() => undefined);
    return created;
  },


  /**
   * Approve one level. When the final level is reached the loan is converted
   * into an advance entry so payroll deducts the EMI automatically.
   */
  async approve(loan: LoanRequest, approver: { name: string; role: string }, comment?: string): Promise<LoanRequest | null> {
    const step: LoanApprovalStep = {
      level: loan.currentApprovalLevel,
      action: 'approved',
      by: approver.name,
      role: approver.role,
      comment,
      at: new Date().toISOString(),
    };
    const history = [...loan.approvalHistory, step];
    const isFinal = loan.currentApprovalLevel >= loan.requiredApprovalLevels;

    let advanceEntryId: string | undefined;
    if (isFinal) {
      const entry = await advanceEntryService.create({
        staffId: loan.staffId,
        entryDate: new Date().toISOString().slice(0, 10),
        amount: loan.amount,
        purpose: `Loan: ${loan.reason}`,
        month: new Date().getMonth(),
        year: new Date().getFullYear(),
        deductPeriods: loan.emiMonths,
        startDeductMonth: loan.startMonth,
        startDeductYear: loan.startYear,
        totalDeducted: 0,
      });
      if (!entry) throw new Error('Loan approved but the advance entry could not be created. Please retry.');
      advanceEntryId = entry.id;
    }

    const { data, error } = await dataApi
      .from('loan_requests')
      .update({
        status: isFinal ? 'approved' : 'pending',
        current_approval_level: isFinal ? loan.currentApprovalLevel : loan.currentApprovalLevel + 1,
        approval_history: history,
        advance_entry_id: advanceEntryId ?? loan.advanceEntryId ?? null,
        approved_at: isFinal ? new Date().toISOString() : null,
      })
      .eq('id', loan.id)
      .select()
      .single();
    if (error) {
      console.error('Error approving loan:', error);
      throw new Error(error.message);
    }
    const updated = mapFromDb(data);
    await auditLogService.log({
      action: 'loan_approval',
      staffId: loan.staffId,
      staffName: loan.staffName,
      details: `Loan of ₹${loan.amount.toLocaleString('en-IN')} approved at level ${loan.currentApprovalLevel} of ${loan.requiredApprovalLevels} by ${approver.name} (${approver.role})${isFinal ? ' — final approval, EMI schedule created' : ''}${comment ? ` — note: ${comment}` : ''}`,
      performedBy: approver.name,
      before: { status: loan.status, current_approval_level: loan.currentApprovalLevel },
      after: { status: updated.status, current_approval_level: updated.currentApprovalLevel, advance_entry_id: updated.advanceEntryId ?? null },
    }).catch(() => undefined);
    return updated;
  },

  async reject(loan: LoanRequest, approver: { name: string; role: string }, reason: string): Promise<LoanRequest | null> {
    const history = [...loan.approvalHistory, {
      level: loan.currentApprovalLevel,
      action: 'rejected' as const,
      by: approver.name,
      role: approver.role,
      comment: reason,
      at: new Date().toISOString(),
    }];
    const { data, error } = await dataApi
      .from('loan_requests')
      .update({ status: 'rejected', rejection_reason: reason, approval_history: history })
      .eq('id', loan.id)
      .select()
      .single();
    if (error) {
      console.error('Error rejecting loan:', error);
      throw new Error(error.message);
    }
    await auditLogService.log({
      action: 'loan_rejection',
      staffId: loan.staffId,
      staffName: loan.staffName,
      details: `Loan of ₹${loan.amount.toLocaleString('en-IN')} rejected at level ${loan.currentApprovalLevel} by ${approver.name} (${approver.role}) — reason: ${reason}`,
      performedBy: approver.name,
      before: { status: loan.status },
      after: { status: 'rejected', rejection_reason: reason },
    }).catch(() => undefined);
    return mapFromDb(data);
  },

  /** Change the EMI plan of an approved loan (admin only) and sync the advance entry. */
  async updateEmiPlan(loan: LoanRequest, emiMonths: number, startMonth: number, startYear: number): Promise<boolean> {
    if (loan.advanceEntryId) {
      await advanceEntryService.update(loan.advanceEntryId, {
        deductPeriods: emiMonths,
        startDeductMonth: startMonth,
        startDeductYear: startYear,
      });
    }
    const { error } = await dataApi
      .from('loan_requests')
      .update({ emi_months: emiMonths, start_month: startMonth, start_year: startYear })
      .eq('id', loan.id);
    if (error) {
      console.error('Error updating EMI plan:', error);
      return false;
    }
    await auditLogService.log({
      action: 'loan_emi_update',
      staffId: loan.staffId,
      staffName: loan.staffName,
      details: `EMI plan changed to ${emiMonths} month(s) starting ${startMonth + 1}/${startYear} for a loan of ₹${loan.amount.toLocaleString('en-IN')}`,
      performedBy: currentActor().name,
      before: { emi_months: loan.emiMonths, start_month: loan.startMonth, start_year: loan.startYear },
      after: { emi_months: emiMonths, start_month: startMonth, start_year: startYear },
    }).catch(() => undefined);
    return true;
  },

};
