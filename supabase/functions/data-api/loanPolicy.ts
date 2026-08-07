// Pure authorization rules for `loan_requests`.
// Kept dependency-free so the same logic runs inside the edge function and
// inside the frontend test suite (src/test/loanPolicy.test.ts).

export type LoanRole =
  | "admin"
  | "manager"
  | "staff"
  | "statutory_admin"
  | "supervisor"
  | "floor_supervisor"
  | "super_admin";

export interface LoanThresholds {
  /** Loans up to this amount can be fully approved by a manager alone. */
  managerMaxAmount: number;
  /** Hard ceiling — no loan above this may be created or approved. */
  adminMaxAmount: number;
  /** Maximum number of EMI months a loan may be spread over. */
  maxEmiMonths: number;
}

export const DEFAULT_LOAN_THRESHOLDS: LoanThresholds = {
  managerMaxAmount: 10000,
  adminMaxAmount: 100000,
  maxEmiMonths: 12,
};

export interface PolicyResult {
  ok: boolean;
  error?: string;
  status?: number;
}

const deny = (error: string, status = 403): PolicyResult => ({ ok: false, error, status });
const allow: PolicyResult = { ok: true };

export function parseThresholds(raw: unknown): LoanThresholds {
  if (typeof raw !== "string" || !raw) return DEFAULT_LOAN_THRESHOLDS;
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_LOAN_THRESHOLDS, ...(parsed ?? {}) };
  } catch {
    return DEFAULT_LOAN_THRESHOLDS;
  }
}

/** Number of approval levels an amount requires. */
export function requiredLevels(amount: number, t: LoanThresholds): number {
  return amount <= t.managerMaxAmount ? 1 : 2;
}

const ADMIN_ROLES: LoanRole[] = ["admin", "statutory_admin"];
const APPROVER_ROLES: LoanRole[] = ["admin", "statutory_admin", "manager"];

export interface LoanRow {
  id?: string;
  staff_id?: string;
  amount?: number | string;
  status?: string;
  current_approval_level?: number | null;
  required_approval_levels?: number | null;
}

/**
 * Normalise + validate rows on INSERT. Staff rows are always rewritten so a
 * crafted payload can never pre-approve a loan or file one for someone else.
 */
export function sanitizeLoanInsert(
  rows: Array<Record<string, unknown>>,
  ctx: { role: LoanRole; userId: string; thresholds: LoanThresholds },
): PolicyResult & { rows: Array<Record<string, unknown>> } {
  const { role, userId, thresholds } = ctx;
  for (const r of rows) {
    if (role === "staff") r["staff_id"] = userId;
    if (!r["staff_id"]) return { ...deny("A loan request must be linked to a staff member", 400), rows };

    const amount = Number(r["amount"]);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ...deny("Loan amount must be greater than zero", 400), rows };
    }
    if (amount > thresholds.adminMaxAmount) {
      return { ...deny(`Loan amount exceeds the sanctioned ceiling of ${thresholds.adminMaxAmount}`, 400), rows };
    }
    const months = Number(r["emi_months"] ?? 1);
    if (!Number.isInteger(months) || months < 1 || months > thresholds.maxEmiMonths) {
      return { ...deny(`EMI months must be between 1 and ${thresholds.maxEmiMonths}`, 400), rows };
    }

    // Every new request starts unapproved, regardless of who submits it.
    r["status"] = "pending";
    r["current_approval_level"] = 1;
    r["approval_history"] = [];
    r["advance_entry_id"] = null;
    r["approved_at"] = null;
    r["rejection_reason"] = null;
    r["required_approval_levels"] = requiredLevels(amount, thresholds);
  }
  return { ...allow, rows };
}

/** Fields the owning staff member may still change while the loan is pending. */
const STAFF_EDITABLE = [
  "amount",
  "reason",
  "emi_months",
  "start_month",
  "start_year",
  "required_approval_levels",
];

/**
 * Authorize an UPDATE (approve / reject / re-plan) against the persisted row.
 */
export function evaluateLoanUpdate(ctx: {
  role: LoanRole;
  loan: LoanRow | null;
  values: Record<string, unknown>;
  thresholds: LoanThresholds;
  userId?: string;
}): PolicyResult {
  const { role, loan, values, thresholds, userId } = ctx;

  if (role === "staff") {
    // Staff may amend their own request only while it is still awaiting approval.
    if (!loan) return deny("Loan request not found", 404);
    if (!userId || String(loan.staff_id) !== String(userId)) {
      return deny("You can only edit your own loan request");
    }
    if (loan.status !== "pending" || (loan.current_approval_level ?? 1) > 1) {
      return deny("This request is already under review and can no longer be edited");
    }
    for (const key of Object.keys(values)) {
      if (!STAFF_EDITABLE.includes(key)) {
        return deny("Only the amount, reason and EMI plan can be changed");
      }
    }
    const nextAmount = values["amount"] !== undefined ? Number(values["amount"]) : Number(loan.amount ?? 0);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return deny("Loan amount must be greater than zero", 400);
    }
    if (nextAmount > thresholds.adminMaxAmount) {
      return deny(`Loan amount exceeds the sanctioned ceiling of ${thresholds.adminMaxAmount}`, 400);
    }
    if (values["emi_months"] !== undefined) {
      const months = Number(values["emi_months"]);
      if (!Number.isInteger(months) || months < 1 || months > thresholds.maxEmiMonths) {
        return deny(`EMI months must be between 1 and ${thresholds.maxEmiMonths}`, 400);
      }
    }
    // Approval depth always follows the (possibly new) amount.
    values["required_approval_levels"] = requiredLevels(nextAmount, thresholds);
    return allow;
  }
  if (!APPROVER_ROLES.includes(role) && role !== "super_admin") {
    return deny(`Role '${role}' cannot act on loan requests`);
  }
  if (!loan) return deny("Loan request not found", 404);

  const amount = Number(loan.amount ?? 0);
  const isAdmin = ADMIN_ROLES.includes(role) || role === "super_admin";
  const level = loan.current_approval_level ?? 1;
  const required = loan.required_approval_levels ?? requiredLevels(amount, thresholds);
  const nextStatus = typeof values["status"] === "string" ? (values["status"] as string) : undefined;
  const isApproving = nextStatus === "approved";
  const isRejecting = nextStatus === "rejected";

  // Only an admin may touch a loan that is already decided.
  if (loan.status !== "pending" && !isAdmin) {
    return deny("This loan request has already been decided");
  }

  if (!isAdmin) {
    if (level !== 1) return deny("This loan needs admin-level approval");
    if (isApproving) {
      if (amount > thresholds.managerMaxAmount) {
        return deny(`Loans above ${thresholds.managerMaxAmount} require admin approval`);
      }
      if (required > 1) return deny("This loan needs admin-level approval");
    }
    // A manager can never rewrite the sanctioned terms.
    for (const locked of ["amount", "emi_months", "required_approval_levels", "staff_id", "advance_entry_id"]) {
      if (values[locked] !== undefined) {
        return deny("Only an admin can change the sanctioned loan terms");
      }
    }
  }

  if (isApproving && amount > thresholds.adminMaxAmount) {
    return deny(`Loan amount exceeds the sanctioned ceiling of ${thresholds.adminMaxAmount}`);
  }
  if (isRejecting && !values["rejection_reason"] && !values["approval_history"]) {
    return deny("A rejection reason is required", 400);
  }
  if (values["emi_months"] !== undefined) {
    const months = Number(values["emi_months"]);
    if (!Number.isInteger(months) || months < 1 || months > thresholds.maxEmiMonths) {
      return deny(`EMI months must be between 1 and ${thresholds.maxEmiMonths}`, 400);
    }
  }
  return allow;
}

export function evaluateLoanDelete(
  role: LoanRole,
  ctx?: { loan?: LoanRow | null; userId?: string },
): PolicyResult {
  if (role === "admin" || role === "super_admin") return allow;
  if (role === "staff") {
    const loan = ctx?.loan;
    if (!loan) return deny("Loan request not found", 404);
    if (!ctx?.userId || String(loan.staff_id) !== String(ctx.userId)) {
      return deny("You can only withdraw your own loan request");
    }
    if (loan.status !== "pending") {
      return deny("This request has already been decided and cannot be withdrawn");
    }
    return allow;
  }
  return deny("Only an admin can delete loan requests");
}
