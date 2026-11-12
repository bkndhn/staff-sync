import { describe, it, expect } from 'vitest';
import { parseClock, workedMinutes, fmtHours } from '../utils/workHours';

describe('daily working hours', () => {
  it('reads 24h and AM/PM times', () => {
    expect(parseClock('09:15')).toBe(555);
    expect(parseClock('6:30 PM')).toBe(1110);
    expect(parseClock('12:05 AM')).toBe(5);
  });
  it('subtracts the break', () => {
    expect(workedMinutes('09:00', '18:00', '13:00', '13:30')).toBe(510);
    expect(fmtHours(510)).toBe('8h 30m');
  });
  it('counts still-working staff up to now, and wraps overnight', () => {
    expect(workedMinutes('10:00', null, null, null, 12 * 60)).toBe(120);
    expect(workedMinutes('22:00', '06:00')).toBe(480);
  });
});
