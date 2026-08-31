import { dataApi } from '../lib/dataApi';
import { PayrollDetail, Staff } from '../types';

/** Payload embedded in a magic link — a frozen copy of the payslip. */
export interface PayslipSnapshot {
  staffName: string;
  employeeCode?: string;
  designation?: string;
  location?: string;
  month: number;
  year: number;
  earnings: { label: string; amount: number }[];
  deductions: { label: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  employerName?: string;
  issuedAt: string;
}

const n = (v: unknown) => (typeof v === 'number' && isFinite(v) ? Math.round(v) : 0);

const randomToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export const buildPayslipSnapshot = (
  member: Staff,
  detail: PayrollDetail,
  month: number,
  year: number,
  employerName?: string,
): PayslipSnapshot => {
  const earnings = [
    { label: 'Basic', amount: n(detail.basicEarned) },
    { label: 'HRA', amount: n(detail.hraEarned) },
    { label: 'Incentive', amount: n(detail.incentiveEarned) },
    { label: 'Meal allowance', amount: n(detail.mealAllowance) },
    ...Object.entries(detail.salarySupplements || {}).map(([label, amount]) => ({ label, amount: n(amount) })),
  ].filter(e => e.amount > 0);

  const deductions = [
    ...(detail.statutoryBreakdown || []).map(b => ({ label: b.label, amount: n(b.amount) })),
    { label: 'Advance / EMI recovery', amount: n(detail.deduction) },
    { label: 'Sunday penalty', amount: n(detail.sundayPenalty) },
    { label: 'Late coming', amount: n(detail.lateComingDeduction) },
    { label: 'Early leaving', amount: n(detail.earlyLeaveDeduction) },
  ].filter(d => d.amount > 0);

  const gross = n(detail.grossPayroll ?? detail.grossSalary);
  const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);

  return {
    staffName: member.name,
    employeeCode: member.employeeCode,
    designation: member.designation,
    location: member.location,
    month,
    year,
    earnings,
    deductions,
    gross,
    totalDeductions,
    net: n(detail.netPayroll ?? detail.netSalary),
    presentDays: n(detail.presentDays),
    halfDays: n(detail.halfDays),
    leaveDays: n(detail.leaveDays),
    employerName,
    issuedAt: new Date().toISOString(),
  };
};

export interface IssuedPayslipLink {
  id: string;
  url: string;
  expiresAt: string;
}

export interface PayslipLinkRow {
  id: string;
  staff_id: string;
  month: number;
  year: number;
  snapshot: PayslipSnapshot;
  expires_at: string;
  revoked_at: string | null;
  view_count: number | null;
  last_viewed_at: string | null;
  created_at: string;
}

/** A link is only usable when it is neither revoked nor past its expiry. */
export const isLinkActive = (row: { expires_at: string; revoked_at?: string | null }): boolean =>
  !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

const sessionToken = (): string | null => {
  try {
    const saved = localStorage.getItem('staffManagementLogin');
    return saved ? JSON.parse(saved)?.sessionToken || null : null;
  } catch {
    return null;
  }
};

export const payslipLinkService = {
  /** Issue a one-off, expiring magic link for a single payslip. */
  async issue(
    member: Staff,
    detail: PayrollDetail,
    month: number,
    year: number,
    options: { validDays?: number; issuedBy?: string; employerName?: string; notify?: boolean } = {},
  ): Promise<IssuedPayslipLink> {
    const token = randomToken();
    const tokenHash = await sha256(token);
    const validDays = Math.min(90, Math.max(1, options.validDays ?? 30));
    const expiresAt = new Date(Date.now() + validDays * 86400000).toISOString();
    const snapshot = buildPayslipSnapshot(member, detail, month, year, options.employerName);

    // Re-issuing supersedes any earlier link for the same employee + period,
    // so an old URL stops working the moment a new one is handed out.
    await payslipLinkService.revokeForPeriod(member.id, month, year).catch(() => undefined);

    const { data, error } = await dataApi.from('payslip_links').insert({
      staff_id: member.id,
      token_hash: tokenHash,
      month,
      year,
      snapshot,
      issued_by: options.issuedBy,
      expires_at: expiresAt,
    });

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = Array.isArray(data) ? data[0] : data;
    const url = `${window.location.origin}/payslip/${token}`;

    if (options.notify !== false) {
      payslipLinkService.notify({ staffId: member.id, month, year, url }).catch(() => undefined);
    }

    return { id: row?.id || '', url, expiresAt };
  },

  async revoke(id: string): Promise<void> {
    const { error } = await dataApi
      .from('payslip_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** Revoke every still-active link for one employee and payroll period. */
  async revokeForPeriod(staffId: string, month: number, year: number): Promise<void> {
    const { data } = await dataApi
      .from('payslip_links')
      .select('id, expires_at, revoked_at')
      .eq('staff_id', staffId)
      .eq('month', month)
      .eq('year', year)
      .order('id', { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((data as any[]) || []).filter(r => !r.revoked_at);
    for (const row of rows) {
      await payslipLinkService.revoke(row.id).catch(() => undefined);
    }
  },

  /** Links issued for a payroll period (admin audit view). */
  async listForPeriod(month: number, year: number) {
    const { data, error } = await dataApi
      .from('payslip_links')
      .select('id, staff_id, month, year, expires_at, revoked_at, view_count, last_viewed_at, created_at')
      .eq('month', month)
      .eq('year', year)
      .order('id', { ascending: true });
    if (error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []);
  },

  /** Payslip history for the signed-in employee (session-scoped). */
  async listForStaff(staffId: string): Promise<PayslipLinkRow[]> {
    const { data, error } = await dataApi
      .from('payslip_links')
      .select('id, staff_id, month, year, snapshot, expires_at, revoked_at, view_count, last_viewed_at, created_at')
      .eq('staff_id', staffId)
      .order('id', { ascending: true });
    if (error) return [];
    return ((data as PayslipLinkRow[]) || []);
  },

  /** Notify an employee that a payslip or compliance document is ready. */
  async notify(input: {
    staffId: string;
    month: number;
    year: number;
    url?: string;
    kind?: 'payslip' | 'compliance';
    documentName?: string;
  }): Promise<boolean> {
    const token = sessionToken();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-payslip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          ...(token ? { 'x-session-token': token } : {}),
          ...(token && token.startsWith('eyJ') ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ kind: 'payslip', ...input }),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};

/** Public resolver used by the magic-link page (no session required). */
export const fetchPayslipByToken = async (token: string): Promise<PayslipSnapshot> => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/payslip-view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error(body?.error || 'Too many attempts. Please try again later.');
  if (!res.ok) throw new Error(body?.error || 'This payslip link could not be opened.');
  return body.snapshot as PayslipSnapshot;
};
