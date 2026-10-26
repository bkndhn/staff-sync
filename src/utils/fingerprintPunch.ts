/** Anti-abuse rules for master-phone fingerprint punches. */
export const FP_COOLDOWN_MS = 2 * 60 * 1000;
export const FP_MIN_SHIFT_MIN = 30;

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
