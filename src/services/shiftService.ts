import { appSettingsService } from './appSettingsService';
import { Staff } from '../types';

export type ShiftKey = 'Morning' | 'Evening' | 'Both';

export interface ShiftWindow {
  start: string;          // "HH:MM" 24h
  end: string;            // "HH:MM" 24h
  graceLateMin: number;   // arrival grace before half-day kicks in
  graceEarlyMin: number;  // early-leave grace before half-day kicks in
  minHoursFull: number;   // min worked hours to count Full
  minHoursHalf: number;   // min worked hours to count Half (else Absent)
}

export type ShiftWindows = Record<ShiftKey, ShiftWindow>;

export const DEFAULT_SHIFT_WINDOWS: ShiftWindows = {
  Morning: { start: '10:00', end: '14:00', graceLateMin: 15, graceEarlyMin: 15, minHoursFull: 4, minHoursHalf: 2 },
  Evening: { start: '14:00', end: '21:00', graceLateMin: 15, graceEarlyMin: 15, minHoursFull: 6, minHoursHalf: 3 },
  Both:    { start: '10:00', end: '21:00', graceLateMin: 20, graceEarlyMin: 20, minHoursFull: 8, minHoursHalf: 4 },
};

let cache: ShiftWindows | null = null;

export const shiftService = {
  async loadGlobal(force = false): Promise<ShiftWindows> {
    if (cache && !force) return cache;
    try {
      const raw = await appSettingsService.getSetting('shift_windows');
      if (raw) {
        const parsed = JSON.parse(raw);
        cache = { ...DEFAULT_SHIFT_WINDOWS, ...parsed };
      } else {
        cache = DEFAULT_SHIFT_WINDOWS;
      }
    } catch {
      cache = DEFAULT_SHIFT_WINDOWS;
    }
    return cache!;
  },

  async saveGlobal(windows: ShiftWindows): Promise<boolean> {
    cache = windows;
    return appSettingsService.setSetting('shift_windows', JSON.stringify(windows));
  },

  /** Resolve effective window for a staff (per-staff override > global by shift). */
  resolve(staff: Pick<Staff, 'shift' | 'shiftWindow'> | undefined, global: ShiftWindows): ShiftWindow {
    const shiftKey: ShiftKey = (staff?.shift as ShiftKey) || 'Both';
    const base = global[shiftKey] || DEFAULT_SHIFT_WINDOWS[shiftKey];
    const override = staff?.shiftWindow;
    if (!override) return base;
    return { ...base, ...override };
  },
};

// ---------- Time helpers ----------

export const parseHHMM = (t?: string): number | null => {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
};

export const formatTime12h = (t?: string): string => {
  const mins = parseHHMM(t);
  if (mins == null) return '—';
  const h24 = Math.floor(mins / 60);
  const mm = mins % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`;
};

export const minutesBetween = (start?: string, end?: string): number => {
  const a = parseHHMM(start);
  const b = parseHHMM(end);
  if (a == null || b == null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // overnight safety
  return diff;
};

/**
 * Decide attendance status from punch times relative to a shift window.
 * Combined rule: Late-arrival OR early-leave beyond grace => Half Day,
 * AND worked-hours below minHoursHalf => Absent, below minHoursFull => Half.
 * Whichever is stricter wins.
 */
export const determineStatus = (
  arrival: string | undefined,
  leaving: string | undefined,
  win: ShiftWindow,
): { status: 'Present' | 'Half Day' | 'Absent'; reasons: string[] } => {
  const reasons: string[] = [];
  if (!arrival) return { status: 'Absent', reasons: ['No arrival punch'] };

  const start = parseHHMM(win.start)!;
  const end = parseHHMM(win.end)!;
  const arr = parseHHMM(arrival)!;
  const lev = leaving ? parseHHMM(leaving) : null;

  // 1) Window-based check
  const lateBy = arr - start;
  let windowVerdict: 'Present' | 'Half Day' = 'Present';
  if (lateBy > win.graceLateMin) {
    windowVerdict = 'Half Day';
    reasons.push(`Late by ${lateBy} min`);
  }
  if (lev != null) {
    const earlyBy = end - lev;
    if (earlyBy > win.graceEarlyMin) {
      windowVerdict = 'Half Day';
      reasons.push(`Left ${earlyBy} min early`);
    }
  }

  // 2) Worked-hours check (only when we have OUT punch)
  let hoursVerdict: 'Present' | 'Half Day' | 'Absent' = 'Present';
  if (lev != null) {
    const hrs = minutesBetween(arrival, leaving) / 60;
    if (hrs < win.minHoursHalf) {
      hoursVerdict = 'Absent';
      reasons.push(`Worked ${hrs.toFixed(1)}h (< ${win.minHoursHalf}h)`);
    } else if (hrs < win.minHoursFull) {
      hoursVerdict = 'Half Day';
      reasons.push(`Worked ${hrs.toFixed(1)}h (< ${win.minHoursFull}h)`);
    }
  }

  // Combined: strictest wins (Absent > Half Day > Present)
  const order = { Present: 0, 'Half Day': 1, Absent: 2 } as const;
  const finalKey = order[windowVerdict] >= order[hoursVerdict] ? windowVerdict : hoursVerdict;
  return { status: finalKey, reasons };
};