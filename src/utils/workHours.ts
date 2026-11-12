/** Parses "09:15", "9:15 AM", "09:15:30" or an ISO time into minutes since midnight. */
export function parseClock(v?: string | null): number | null {
  if (!v) return null;
  const s = String(v).trim();
  if (s.includes('T')) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.getHours() * 60 + d.getMinutes();
  }
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Worked minutes between in and out, minus a break if both break times are known. Overnight shifts wrap. */
export function workedMinutes(inT?: string | null, outT?: string | null, breakOut?: string | null, breakIn?: string | null, nowMin?: number): number | null {
  const a = parseClock(inT);
  if (a == null) return null;
  let b = parseClock(outT);
  if (b == null) { if (nowMin == null) return null; b = nowMin; }
  let total = b - a;
  if (total < 0) total += 1440;
  const bo = parseClock(breakOut), bi = parseClock(breakIn);
  if (bo != null && bi != null) { let br = bi - bo; if (br < 0) br += 1440; if (br < total) total -= br; }
  return total;
}

export const fmtHours = (min: number | null | undefined): string =>
  min == null ? '—' : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m`;
