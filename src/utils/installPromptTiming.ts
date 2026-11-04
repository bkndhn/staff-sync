/** When to show the "Install ZenHR" sheet and the permissions sheet. Pure so it can be unit-tested. */
export const INSTALL_FIRST_DELAY_MS = 8_000;       // after the link is opened
export const INSTALL_REPEAT_MS = 3 * 60_000;        // ask again a few minutes later if not installed
export const INSTALL_MAX_SNOOZE_MS = 24 * 60 * 60_000;

export const PERMS_FIRST_DELAY_MS = 4_000;          // shown after the install sheet is out of the way
export const PERMS_REPEAT_MS = 30 * 60_000;         // "Not now" → ask again in 30 min, then 1 h, 2 h … 24 h

export interface InstallState { dismissals: number; lastDismissed: number }

/** Each "Later" waits longer: 3 min, 6 min, 12 min … capped at 24 h. */
export function snoozeFor(dismissals: number, base = INSTALL_REPEAT_MS): number {
  return Math.min(base * 2 ** Math.max(0, dismissals - 1), INSTALL_MAX_SNOOZE_MS);
}

export function msUntilNextPrompt(s: InstallState, now: number, installed: boolean): number | null {
  if (installed) return null;
  if (!s.dismissals) return INSTALL_FIRST_DELAY_MS;
  return Math.max(0, s.lastDismissed + snoozeFor(s.dismissals) - now);
}

/** Same back-off for the permissions sheet; null when nothing is missing. */
export function msUntilPermsPrompt(s: InstallState, now: number, missing: number): number | null {
  if (missing <= 0) return null;
  if (!s.dismissals) return PERMS_FIRST_DELAY_MS;
  return Math.max(0, s.lastDismissed + snoozeFor(s.dismissals, PERMS_REPEAT_MS) - now);
}

export type InstallPlatform = 'native-prompt' | 'ios' | 'android-menu' | 'none';

/** Which install help to show. Chrome/Edge/Samsung only fire the native prompt when the app is NOT installed. */
export function installPlatform(opts: {
  ua: string; hasDeferredPrompt: boolean; supportsPromptEvent: boolean; standalone: boolean; embedded: boolean;
}): InstallPlatform {
  if (opts.standalone || opts.embedded) return 'none';
  if (opts.hasDeferredPrompt) return 'native-prompt';
  const ua = opts.ua.toLowerCase();
  const ios = /iphone|ipad|ipod/.test(ua) || (ua.includes('macintosh') && ua.includes('mobile'));
  if (ios) return 'ios';
  if (/android/.test(ua) && !opts.supportsPromptEvent) return 'android-menu';
  return 'none';
}
