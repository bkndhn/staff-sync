import { describe, it, expect } from 'vitest';
import {
  INSTALL_FIRST_DELAY_MS, msUntilNextPrompt, msUntilPermsPrompt, snoozeFor, installPlatform, PERMS_FIRST_DELAY_MS,
} from '../utils/installPromptTiming';

const MIN = 60_000;

describe('install sheet timing', () => {
  it('first shows a few seconds after the link is opened', () => {
    expect(msUntilNextPrompt({ dismissals: 0, lastDismissed: 0 }, Date.now(), false)).toBe(INSTALL_FIRST_DELAY_MS);
  });
  it('repeats after a few minutes when not installed, waiting longer each time', () => {
    expect(snoozeFor(1)).toBe(3 * MIN);
    expect(snoozeFor(2)).toBe(6 * MIN);
    expect(snoozeFor(3)).toBe(12 * MIN);
    expect(snoozeFor(30)).toBe(24 * 60 * MIN);
    const now = 1_000_000_000;
    expect(msUntilNextPrompt({ dismissals: 1, lastDismissed: now - MIN }, now, false)).toBe(2 * MIN);
  });
  it('never shows once installed', () => {
    expect(msUntilNextPrompt({ dismissals: 0, lastDismissed: 0 }, Date.now(), true)).toBeNull();
  });
});

describe('permissions sheet timing', () => {
  it('does not show when every permission is on', () => {
    expect(msUntilPermsPrompt({ dismissals: 0, lastDismissed: 0 }, Date.now(), 0)).toBeNull();
  });
  it('asks again after 30 min, then 1 h when skipped', () => {
    const now = 5_000_000_000;
    expect(msUntilPermsPrompt({ dismissals: 0, lastDismissed: 0 }, now, 2)).toBe(PERMS_FIRST_DELAY_MS);
    expect(msUntilPermsPrompt({ dismissals: 1, lastDismissed: now }, now, 2)).toBe(30 * MIN);
    expect(msUntilPermsPrompt({ dismissals: 2, lastDismissed: now }, now, 1)).toBe(60 * MIN);
  });
});

describe('install help per phone', () => {
  const base = { hasDeferredPrompt: false, supportsPromptEvent: true, standalone: false, embedded: false };
  it('uses the one-tap install when Chrome offers it', () => {
    expect(installPlatform({ ...base, ua: 'Android Chrome', hasDeferredPrompt: true })).toBe('native-prompt');
  });
  it('shows Share → Add to Home Screen on iPhone', () => {
    expect(installPlatform({ ...base, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', supportsPromptEvent: false })).toBe('ios');
  });
  it('shows menu steps on Android browsers without one-tap install', () => {
    expect(installPlatform({ ...base, ua: 'Mozilla/5.0 (Android 14) Firefox', supportsPromptEvent: false })).toBe('android-menu');
  });
  it('stays hidden when already installed, inside the editor frame, or Chrome has nothing to offer', () => {
    expect(installPlatform({ ...base, ua: 'Android', hasDeferredPrompt: true, standalone: true })).toBe('none');
    expect(installPlatform({ ...base, ua: 'iPhone', embedded: true })).toBe('none');
    expect(installPlatform({ ...base, ua: 'Android Chrome' })).toBe('none');
  });
});
