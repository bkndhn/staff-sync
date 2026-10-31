// Pure timing rules for scheduled phone alerts (no Deno APIs, so the app's tests can import it).
// The server timer fires every 15 minutes; each chosen time is matched by exactly one tick.

export const ALERT_KINDS = [
  "attendance_summary",
  "mark_attendance",
  "punch_in_reminder",
  "punch_out_reminder",
  "salary_prep",
  "leave_pending",
] as const;
export type AlertKind = typeof ALERT_KINDS[number];

/** Alerts that go to staff (everything else goes to the chosen manager roles). */
export const STAFF_KINDS: AlertKind[] = ["punch_in_reminder", "punch_out_reminder"];

export type AlertSchedule = {
  id: string;
  kind: AlertKind;
  enabled?: boolean;
  times: string[];
  days: number[]; // 0 = Sunday
  timing: "fixed" | "before_shift";
  offset_minutes: number;
  day_of_month: number | null;
};

export type LocalNow = {
  date: string; // YYYY-MM-DD in the company time zone
  minutes: number; // minutes since local midnight
  weekday: number; // 0 = Sunday
  dayOfMonth: number;
  lastDayOfMonth: number;
};

export type DueSlot = { slotKey: string; target: string; shift?: string };

/** Ticks are 15 minutes apart, so a 14-minute window catches every time exactly once. */
export const WINDOW_MIN = 14;

export const toMin = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
export const toHHMM = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Reminders arrive up to 14 min early (never late); reports arrive up to 14 min after the time. */
export function inWindow(kind: AlertKind, target: number, now: number): boolean {
  if (STAFF_KINDS.includes(kind)) return now >= target - WINDOW_MIN && now <= target;
  return now >= target && now <= target + WINDOW_MIN;
}

export function dayMatches(s: AlertSchedule, now: LocalNow): boolean {
  if (s.day_of_month != null) {
    const want = Math.min(s.day_of_month, now.lastDayOfMonth); // "31st" means last day in short months
    return now.dayOfMonth === want;
  }
  return (s.days?.length ? s.days : [0, 1, 2, 3, 4, 5, 6]).includes(now.weekday);
}

/**
 * Which time slots of this schedule are due at this tick.
 * shiftTimes: for "before_shift" punch reminders, the distinct shift start (or end) times in use.
 */
export function dueSlots(s: AlertSchedule, now: LocalNow, shiftTimes: string[] = []): DueSlot[] {
  if (s.enabled === false || !dayMatches(s, now)) return [];
  const out: DueSlot[] = [];
  if (s.timing === "before_shift") {
    for (const shift of new Set(shiftTimes)) {
      const target = toMin(shift) - Math.max(0, s.offset_minutes || 0);
      if (Number.isNaN(target) || target < 0) continue;
      if (inWindow(s.kind, target, now.minutes)) {
        out.push({ slotKey: `${now.date}T${toHHMM(target)}@${shift}`, target: toHHMM(target), shift });
      }
    }
    return out;
  }
  for (const t of new Set(s.times || [])) {
    const target = toMin(t);
    if (Number.isNaN(target)) continue;
    if (inWindow(s.kind, target, now.minutes)) out.push({ slotKey: `${now.date}T${toHHMM(target)}`, target: toHHMM(target) });
  }
  return out;
}

/** Local clock in a time zone (falls back to India time for unknown zones). */
export function localNow(timezone: string, at: Date = new Date()): LocalNow {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
    });
  } catch {
    return localNow("Asia/Kolkata", at);
  }
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]));
  const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  const hour = Number(p.hour) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: hour * 60 + Number(p.minute),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
    dayOfMonth: d,
    lastDayOfMonth: new Date(Date.UTC(y, mo, 0)).getUTCDate(),
  };
}

/** UTC instant of local midnight for `now` in that zone (to find today's punches). */
export function localMidnightUtc(timezone: string, at: Date = new Date()): Date {
  const n = localNow(timezone, at);
  return new Date(at.getTime() - n.minutes * 60_000 - at.getUTCSeconds() * 1000 - at.getUTCMilliseconds());
}

export const to12h = (hhmm: string): string => {
  const m = toMin(hhmm);
  if (Number.isNaN(m)) return hhmm;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
