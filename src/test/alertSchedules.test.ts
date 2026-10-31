import { describe, it, expect } from 'vitest';
import { dueSlots, localNow, type AlertSchedule, type LocalNow } from '../../supabase/functions/_shared/alertSlots';

const at = (hhmm: string, extra: Partial<LocalNow> = {}): LocalNow => {
  const [h, m] = hhmm.split(':').map(Number);
  return { date: '2026-10-31', minutes: h * 60 + m, weekday: 6, dayOfMonth: 31, lastDayOfMonth: 31, ...extra };
};
const sched = (p: Partial<AlertSchedule>): AlertSchedule => ({
  id: 's1', kind: 'attendance_summary', enabled: true, times: [], days: [0, 1, 2, 3, 4, 5, 6],
  timing: 'fixed', offset_minutes: 0, day_of_month: null, ...p,
});

describe('timed phone alerts', () => {
  it('sends an attendance report at the chosen time, not before', () => {
    const s = sched({ times: ['10:00'] });
    expect(dueSlots(s, at('09:59'))).toHaveLength(0);
    expect(dueSlots(s, at('10:00'))).toHaveLength(1);
    expect(dueSlots(s, at('10:15'))).toHaveLength(0);
  });

  it('supports several times a day, each sent exactly once by the 15-minute timer', () => {
    const s = sched({ times: ['10:00', '13:07', '19:00'] });
    const keys = new Set<string>();
    for (let m = 0; m < 1440; m += 15) {
      for (const d of dueSlots(s, at(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`))) keys.add(d.slotKey);
    }
    expect([...keys].sort()).toEqual(['2026-10-31T10:00', '2026-10-31T13:07', '2026-10-31T19:00']);
  });

  it('punch-in reminder 15 min before a 9:00 AM shift arrives by 8:45, never after', () => {
    const s = sched({ kind: 'punch_in_reminder', timing: 'before_shift', offset_minutes: 15 });
    expect(dueSlots(s, at('08:45'), ['09:00'])[0]?.shift).toBe('09:00');
    expect(dueSlots(s, at('08:31'), ['09:00'])).toHaveLength(1);
    expect(dueSlots(s, at('08:46'), ['09:00'])).toHaveLength(0);
  });

  it('uses each branch shift time separately', () => {
    const s = sched({ kind: 'punch_out_reminder', timing: 'before_shift', offset_minutes: 10 });
    const due = dueSlots(s, at('17:50'), ['18:00', '21:00']);
    expect(due.map((d) => d.shift)).toEqual(['18:00']);
  });

  it('skips days that are not ticked and switched-off alerts', () => {
    expect(dueSlots(sched({ times: ['10:00'], days: [1, 2, 3, 4, 5] }), at('10:00'))).toHaveLength(0); // Saturday
    expect(dueSlots(sched({ times: ['10:00'], enabled: false }), at('10:00'))).toHaveLength(0);
  });

  it('salary prep on "31st" fires on the last day of a short month', () => {
    const s = sched({ kind: 'salary_prep', times: ['10:00'], day_of_month: 31 });
    expect(dueSlots(s, at('10:00', { date: '2026-02-28', dayOfMonth: 28, lastDayOfMonth: 28 }))).toHaveLength(1);
    expect(dueSlots(s, at('10:00', { date: '2026-02-27', dayOfMonth: 27, lastDayOfMonth: 28 }))).toHaveLength(0);
  });

  it('reads India time correctly from the server clock', () => {
    const n = localNow('Asia/Kolkata', new Date('2026-10-31T03:30:00Z'));
    expect(n.date).toBe('2026-10-31');
    expect(n.minutes).toBe(9 * 60);
    expect(n.weekday).toBe(6);
  });
});
