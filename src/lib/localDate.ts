/**
 * Device-local date/time helpers for attendance punches.
 *
 * `new Date().toISOString()` returns the UTC date, which is the *previous* day
 * for any punch made between 00:00 and 05:30 IST. Punch rows store a local
 * clock time (HH:MM:SS), so the date must be local too or the two disagree.
 */

/** YYYY-MM-DD in the device's local timezone. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** HH:MM:SS in the device's local timezone. */
export function localTimeKey(d: Date = new Date()): string {
  return d.toTimeString().split(' ')[0];
}
