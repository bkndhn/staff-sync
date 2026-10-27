import { describe, it, expect } from 'vitest';
import { decideFingerPunch, registerFail, lockSecondsLeft } from '../utils/fingerprintPunch';

describe('fingerprint punch rules', () => {
  it('first touch is IN', () => {
    expect(decideFingerPunch({ rec: null, nowMs: 1e9, nowTime: '09:00' })).toEqual({ ok: true, kind: 'in' });
  });
  it('blocks repeat touch within 2 minutes', () => {
    expect(decideFingerPunch({ rec: null, nowMs: 1e9, lastPunchMs: 1e9 - 60_000, nowTime: '09:01' }).ok).toBe(false);
  });
  it('blocks OUT within 30 minutes of IN', () => {
    expect(decideFingerPunch({ rec: { arrivalTime: '09:00' }, nowMs: 1e9, nowTime: '09:20' }).ok).toBe(false);
  });
  it('allows OUT after 30 minutes', () => {
    expect(decideFingerPunch({ rec: { arrivalTime: '09:00' }, nowMs: 1e9, nowTime: '18:00' })).toEqual({ ok: true, kind: 'out' });
  });
  it('blocks third punch in a day', () => {
    expect(decideFingerPunch({ rec: { arrivalTime: '09:00', leavingTime: '18:00' }, nowMs: 1e9, nowTime: '19:00' }).ok).toBe(false);
  });
  it('locks the station for 60 seconds after 5 wrong touches', () => {
    let s = { count: 0, lockedUntil: 0 };
    for (let i = 0; i < 4; i++) s = registerFail(s, 1000);
    expect(lockSecondsLeft(s, 1000)).toBe(0);
    s = registerFail(s, 1000);
    expect(lockSecondsLeft(s, 1000)).toBe(60);
    expect(lockSecondsLeft(s, 61_000)).toBe(0);
  });
});
