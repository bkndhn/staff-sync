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

export const payslipLinkService = {
  /** Issue a one-off, expiring magic link for a single payslip. */
  async issue(
    member: Staff,
    detail: PayrollDetail,
    month: number,
    year: number,
    options: { validDays?: number; issuedBy?: string; employerName?: string } = {},
  ): Promise<IssuedPayslipLink> {
    const token = randomToken();
    const tokenHash = await sha256(token);
    const expiresAt = new Date(Date.now() + (options.validDays ?? 30) * 86400000).toISOString();
    const snapshot = buildPayslipSnapshot(member, detail, month, year, options.employerName);

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
    return {
      id: row?.id || '',
      url: `${window.location.origin}/payslip/${token}`,
      expiresAt,
    };
  },

  async revoke(id: string): Promise<void> {
    const { error } = await dataApi
      .from('payslip_links')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  /** Links issued for a payroll period (admin audit view). */
  async listForPeriod(month: number, year: number) {
    const { data, error } = await dataApi
      .from('payslip_links')
      .select('id, staff_id, expires_at, revoked_at, view_count, last_viewed_at, created_at')
      .eq('month', month)
      .eq('year', year)
      .order('id', { ascending: true });
    if (error) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []);
  },
};

/** Public resolver used by the magic-link page (no session required). */
export const fetchPayslipByToken = async (token: string): Promise<PayslipSnapshot> => {
  const base = import.meta.env.VITE_SUPABASE_URL;
  const res = await fetch(`${base}/functions/v1/payslip-view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    },
    body: JSON.stringify({ token }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || 'This payslip link could not be opened.');
  return body.snapshot as PayslipSnapshot;
};
