import { describe, it, expect } from 'vitest';
// @ts-ignore - Deno module, pure function only
import { pickShift } from '../../supabase/functions/_shared/attendanceMerge';

describe('server-side shift resolution for machine punches', () => {
  it('uses roster shift when no times on the attendance row', () => {
    const s = pickShift({ details: {}, rosterKey: 'Morning', staff: {}, windows: null });
    expect(s.start).toBe('10:00'); expect(s.end).toBe('14:00'); expect(s.source).toBe('roster');
  });
  it('uses per-staff window over tenant default', () => {
    const s = pickShift({ details: {}, staff: { shift_window: { start: '09:00', end: '18:00' } }, windows: null });
    expect(s.start).toBe('09:00'); expect(s.end).toBe('18:00');
  });
  it('falls back to tenant Both window', () => {
    const s = pickShift({ details: {}, staff: {}, windows: { Both: { start: '09:30', end: '20:30', graceLateMin: 10, graceEarlyMin: 10 } } });
    expect(s.start).toBe('09:30'); expect(s.graceLateMin).toBe(10);
  });
  it('marks late-deduction-exempt staff so no alert is sent', () => {
    expect(pickShift({ details: {}, staff: { exempt_from_late_deduction: true } }).exempt).toBe(true);
  });
});
