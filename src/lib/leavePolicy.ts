import type { LeaveRequest } from '../services/leaveService';

export type LeaveType = 'casual' | 'sick' | 'personal' | 'emergency' | 'other';

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  casual: 'Casual Leave',
  sick: 'Sick Leave',
  personal: 'Personal Leave',
  emergency: 'Emergency',
  other: 'Other',
};

/** Per-client leave rules. Every client can set their own numbers. */
export interface OrgLeavePolicy {
  /** Annual entitlement (days) per leave type. */
  entitlements: Record<LeaveType, number>;
  /** Max consecutive days allowed in a single request. */
  maxConsecutiveDays: number;
  /** Minimum advance notice (days) per leave type. */
  advanceNoticeDays: Partial<Record<LeaveType, number>>;
  /** Allow sick/emergency leave to be applied for past dates. */
  allowBackdatedSickEmergency: boolean;
}

export const DEFAULT_LEAVE_POLICY: OrgLeavePolicy = {
  entitlements: { casual: 12, sick: 8, personal: 4, emergency: 3, other: 0 },
  maxConsecutiveDays: 15,
  advanceNoticeDays: { casual: 1, personal: 1 },
  allowBackdatedSickEmergency: true,
};

let runtimeLeavePolicy: OrgLeavePolicy = {
  ...DEFAULT_LEAVE_POLICY,
  entitlements: { ...DEFAULT_LEAVE_POLICY.entitlements },
  advanceNoticeDays: { ...DEFAULT_LEAVE_POLICY.advanceNoticeDays },
};

export const setRuntimeLeavePolicy = (policy: Partial<OrgLeavePolicy>) => {
  runtimeLeavePolicy = {
    ...runtimeLeavePolicy,
    ...policy,
    entitlements: { ...runtimeLeavePolicy.entitlements, ...(policy.entitlements || {}) },
    advanceNoticeDays: { ...runtimeLeavePolicy.advanceNoticeDays, ...(policy.advanceNoticeDays || {}) },
  };
};
export const getRuntimeLeavePolicy = (): OrgLeavePolicy => runtimeLeavePolicy;

/** Annual entitlement (days) per leave type, as configured by this client. */
export const getLeaveEntitlements = (): Record<LeaveType, number> => runtimeLeavePolicy.entitlements;

const MS_DAY = 24 * 60 * 60 * 1000;

export const parseDate = (value: string): Date => new Date(`${value}T00:00:00`);

export const countDays = (start: string, end?: string | null): number => {
  if (!start) return 0;
  const s = parseDate(start).getTime();
  const e = end ? parseDate(end).getTime() : s;
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.round((e - s) / MS_DAY) + 1;
};

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart <= bEnd && bStart <= aEnd;

export interface LeaveBalance {
  type: LeaveType;
  entitled: number;
  used: number;
  pending: number;
  remaining: number;
}

/** Compute balances for a year from the staff's own request history. */
export const computeLeaveBalances = (requests: LeaveRequest[], year = new Date().getFullYear()): LeaveBalance[] => {
  const entitlements = getLeaveEntitlements();
  const types = Object.keys(entitlements) as LeaveType[];
  return types.map(type => {
    let used = 0;
    let pending = 0;
    requests.forEach(r => {
      if (r.leaveType !== type) return;
      if (parseDate(r.leaveDate).getFullYear() !== year) return;
      const days = countDays(r.leaveDate, r.leaveEndDate);
      if (r.status === 'approved') used += days;
      else if (r.status === 'pending' || r.status === 'postponed') pending += days;
    });
    const entitled = entitlements[type] ?? 0;
    return { type, entitled, used, pending, remaining: Math.max(0, entitled - used - pending) };
  });
};

export interface LeaveValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  days: number;
}

export interface LeaveDraft {
  leaveDate: string;
  leaveEndDate?: string;
  leaveType: LeaveType;
  reason: string;
}

/** Policy validation for a new (or edited) leave request. */
export const validateLeaveRequest = (
  draft: LeaveDraft,
  existing: LeaveRequest[] = [],
  options: { ignoreId?: string; today?: Date } = {}
): LeaveValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const today = options.today ?? new Date();
  today.setHours(0, 0, 0, 0);

  if (!draft.leaveDate) errors.push('Select a start date.');
  if (!draft.reason || draft.reason.trim().length < 5) errors.push('Provide a reason (at least 5 characters).');

  const days = countDays(draft.leaveDate, draft.leaveEndDate);
  if (draft.leaveDate && draft.leaveEndDate && days === 0) errors.push('End date must be on or after the start date.');
  if (days > MAX_CONSECUTIVE_DAYS) errors.push(`A single request cannot exceed ${MAX_CONSECUTIVE_DAYS} days.`);

  if (draft.leaveDate) {
    const start = parseDate(draft.leaveDate);
    const diffDays = Math.round((start.getTime() - today.getTime()) / MS_DAY);
    if (diffDays < 0) {
      if (draft.leaveType === 'sick' || draft.leaveType === 'emergency') {
        warnings.push('This is a back-dated request and will need manager justification.');
      } else {
        errors.push('Past dates are only allowed for sick or emergency leave.');
      }
    }
    const notice = ADVANCE_NOTICE_DAYS[draft.leaveType];
    if (notice !== undefined && diffDays >= 0 && diffDays < notice) {
      warnings.push(`${LEAVE_TYPE_LABELS[draft.leaveType]} normally needs ${notice} day(s) advance notice.`);
    }
  }

  // Overlap with own existing requests
  if (draft.leaveDate) {
    const start = draft.leaveDate;
    const end = draft.leaveEndDate || draft.leaveDate;
    const clash = existing.find(r =>
      r.id !== options.ignoreId &&
      r.status !== 'rejected' &&
      overlaps(start, end, r.leaveDate, r.leaveEndDate || r.leaveDate)
    );
    if (clash) errors.push('These dates overlap an existing leave request.');
  }

  // Balance check
  const balances = computeLeaveBalances(
    existing.filter(r => r.id !== options.ignoreId),
    draft.leaveDate ? parseDate(draft.leaveDate).getFullYear() : today.getFullYear()
  );
  const bal = balances.find(b => b.type === draft.leaveType);
  if (bal && bal.entitled > 0 && days > bal.remaining) {
    warnings.push(`Only ${bal.remaining} of ${bal.entitled} ${LEAVE_TYPE_LABELS[draft.leaveType]} day(s) remain — extra days may be unpaid.`);
  }

  return { valid: errors.length === 0, errors, warnings, days };
};
