// Hours-based attendance: worked >= X hrs = full day, >= 3/4 X = 3/4 day,
// >= 1/2 X = half day, otherwise absent. Never produces overtime.
import { appSettingsService } from '../services/appSettingsService';

export function hoursToStatus(workedMin: number, fullDayHours: number): { status: 'Present' | '3/4 Day' | 'Half Day' | 'Absent'; value: number } {
  const full = fullDayHours * 60;
  if (workedMin >= full) return { status: 'Present', value: 1 };
  if (workedMin >= full * 0.75) return { status: '3/4 Day', value: 0.75 };
  if (workedMin >= full * 0.5) return { status: 'Half Day', value: 0.5 };
  return { status: 'Absent', value: 0 };
}

export interface StaffHoursOverride { mode: 'hours' | 'standard'; fullDayHours?: number }
export interface HoursRuleConfig {
  enabled: boolean;
  fullDayHours: number;
  autoOut: boolean;
  overrides?: Record<string, StaffHoursOverride>;
}

export const DEFAULT_HOURS_RULE: HoursRuleConfig = { enabled: false, fullDayHours: 8, autoOut: true, overrides: {} };

export function parseHoursRule(raw: string | null | undefined): HoursRuleConfig {
  if (!raw) return { ...DEFAULT_HOURS_RULE };
  try { return { ...DEFAULT_HOURS_RULE, ...JSON.parse(raw) }; } catch { return { ...DEFAULT_HOURS_RULE }; }
}

/** Effective rule for one staff member: per-staff override wins over the org switch. */
export function effectiveHoursRule(cfg: HoursRuleConfig, staffId?: string): { enabled: boolean; fullDayHours: number } {
  const o = staffId ? cfg.overrides?.[staffId] : undefined;
  if (o?.mode === 'standard') return { enabled: false, fullDayHours: cfg.fullDayHours };
  if (o?.mode === 'hours') return { enabled: true, fullDayHours: Number(o.fullDayHours) || cfg.fullDayHours || 8 };
  return { enabled: !!cfg.enabled, fullDayHours: Number(cfg.fullDayHours) || 8 };
}

let cache: { at: number; cfg: HoursRuleConfig } | null = null;
export async function loadHoursRule(force = false): Promise<HoursRuleConfig> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.cfg;
  try {
    const cfg = parseHoursRule(await appSettingsService.getSetting('hours_based_attendance'));
    cache = { at: Date.now(), cfg };
    try { localStorage.setItem('hours_rule_cache', JSON.stringify(cfg)); } catch { /* ignore */ }
    return cfg;
  } catch {
    try { return parseHoursRule(localStorage.getItem('hours_rule_cache')); } catch { return { ...DEFAULT_HOURS_RULE }; }
  }
}
export const invalidateHoursRule = () => { cache = null; };

const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/**
 * Pure: re-derive status for a full-time record with both punches when the
 * hours rule applies. Shared by manual, kiosk, staff portal, biometric hook and
 * offline replay (all go through attendanceService).
 */
export function applyHoursRuleTo<T extends { staffId?: string; isPartTime?: boolean; status?: any; attendanceValue?: number; arrivalTime?: string | null; leavingTime?: string | null; salaryOverride?: boolean; appliedRuleType?: any; breakMinutes?: number }>(rec: T, cfg: HoursRuleConfig): T {
  if (rec.isPartTime || rec.salaryOverride) return rec;
  if (rec.status === 'Absent' && !rec.arrivalTime) return rec;
  const eff = effectiveHoursRule(cfg, rec.staffId);
  if (!eff.enabled) return rec;
  const a = toMin(rec.arrivalTime), l = toMin(rec.leavingTime);
  if (a === null || l === null || l <= a) return rec;
  const r = hoursToStatus(l - a - (Number(rec.breakMinutes) || 0), eff.fullDayHours);
  return { ...rec, status: r.status, attendanceValue: r.value, appliedRuleType: 'hours_based' };
}
