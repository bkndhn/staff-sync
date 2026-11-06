/** Anti-abuse rules for master-phone fingerprint punches. */
export const FP_COOLDOWN_MS = 2 * 60 * 1000;
export const FP_MIN_SHIFT_MIN = 30;
/** Wrong / cancelled finger attempts allowed before the station locks. */
export const FP_MAX_FAILS = 5;
export const FP_LOCK_MS = 60 * 1000;

export interface FingerPunchInput {
  rec?: { arrivalTime?: string | null; leavingTime?: string | null; status?: string } | null;
  nowMs: number;
  lastPunchMs?: number;
  nowTime: string; // HH:MM[:SS]
}
export type FingerPunchDecision = { ok: true; kind: 'in' | 'out' } | { ok: false; reason: string };

const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

export function decideFingerPunch({ rec, nowMs, lastPunchMs, nowTime }: FingerPunchInput): FingerPunchDecision {
  if (lastPunchMs && nowMs - lastPunchMs < FP_COOLDOWN_MS) return { ok: false, reason: 'Already punched just now. Please wait.' };
  if (rec?.status === 'Absent') return { ok: false, reason: 'Marked Absent by management.' };
  if (!rec?.arrivalTime) return { ok: true, kind: 'in' };
  if (rec.leavingTime) return { ok: false, reason: 'Already punched IN and OUT today.' };
  if (mins(nowTime) - mins(rec.arrivalTime) < FP_MIN_SHIFT_MIN) return { ok: false, reason: `OUT allowed only ${FP_MIN_SHIFT_MIN} min after IN.` };
  return { ok: true, kind: 'out' };
}

export interface FailState { count: number; lockedUntil: number }

/** Record a failed touch; locks the station after FP_MAX_FAILS in a row. */
export function registerFail(s: FailState, nowMs: number): FailState {
  const count = s.count + 1;
  return count >= FP_MAX_FAILS ? { count: 0, lockedUntil: nowMs + FP_LOCK_MS } : { count, lockedUntil: s.lockedUntil };
}

/** Seconds left on a lock, 0 when the station is usable. */
export function lockSecondsLeft(s: FailState, nowMs: number): number {
  return s.lockedUntil > nowMs ? Math.ceil((s.lockedUntil - nowMs) / 1000) : 0;
}

/** Metres between two GPS points (haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Local date (YYYY-MM-DD) and time (HH:MM:SS) in a timezone. */
export function localStamp(nowMs: number, tz: string): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}` };
}
