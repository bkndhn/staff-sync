/** When to show the "Install ZenHR" sheet. Pure so it can be unit-tested. */
export const INSTALL_FIRST_DELAY_MS = 8_000;       // after the link is opened
export const INSTALL_REPEAT_MS = 3 * 60_000;        // ask again a few minutes later if not installed
export const INSTALL_MAX_SNOOZE_MS = 24 * 60 * 60_000;

export interface InstallState { dismissals: number; lastDismissed: number }

/** Each "Later" waits longer: 3 min, 6 min, 12 min … capped at 24 h. */
export function snoozeFor(dismissals: number): number {
  return Math.min(INSTALL_REPEAT_MS * 2 ** Math.max(0, dismissals - 1), INSTALL_MAX_SNOOZE_MS);
}

export function msUntilNextPrompt(s: InstallState, now: number, installed: boolean): number | null {
  if (installed) return null;
  if (!s.dismissals) return INSTALL_FIRST_DELAY_MS;
  return Math.max(0, s.lastDismissed + snoozeFor(s.dismissals) - now);
}
