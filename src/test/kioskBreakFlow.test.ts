import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// MOCKED data-api: in-memory break_events table, rows labelled TEST_FLEX_BREAK_*.
const rows: any[] = [];
let seq = 0;
vi.mock('../services/auditLogService', () => ({ auditLogService: { log: async () => ({}) } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../lib/dataApi', () => {
  const builder = () => {
    const f: ((r: any) => boolean)[] = [];
    let op = 'select'; let vals: any; let one = false;
    const run = () => {
      if (op === 'insert') { const r = { id: `brk_${++seq}`, end_time: null, ...vals }; rows.push(r); return { data: r, error: null }; }
      const hit = rows.filter(r => f.every(fn => fn(r)));
      if (op === 'update') { hit.forEach(r => Object.assign(r, vals)); return { data: hit[0] ?? null, error: null }; }
      return { data: one ? hit[0] ?? null : hit, error: null };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b,
      eq: (k: string, v: any) => { f.push(r => r[k] === v); return b; },
      is: (k: string, v: any) => { f.push(r => (r[k] ?? null) === v); return b; },
      insert: (v: any) => { op = 'insert'; vals = v; return b; },
      update: (v: any) => { op = 'update'; vals = v; return b; },
      single: () => { one = true; return b; }, maybeSingle: () => { one = true; return b; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { dataApi: { from: () => builder() } };
});

import { breakEventService } from '../services/breakService';

const lunch = { id: 'bt_lunch', name: 'Lunch', code: 'LUNCH', defaultMinutes: 30, maxMinutes: 30, isPaid: false, isActive: true, sortOrder: 0 };
const staff = { staffId: 'TEST_FLEX_BREAK_01', staffName: 'TEST FLEX BREAK 01', location: 'Godown' };
const at = (hms: string) => vi.setSystemTime(new Date(`2026-10-22T${hms}`));

describe('kiosk break flow (mocked data-api)', () => {
  beforeEach(() => { rows.length = 0; vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());

  it('first scan in break mode starts a break; second scan ends it within limit', async () => {
    at('13:00:00');
    const ev = await breakEventService.start({ ...staff, breakType: lunch, source: 'mobile', deviceLabel: 'Face Kiosk' });
    expect(ev?.startTime).toBe('13:00:00');
    expect((await breakEventService.openBreak(staff.staffId))?.id).toBe(ev!.id);
    at('13:25:00');
    const done = await breakEventService.end({ eventId: ev!.id, staffId: staff.staffId, breakType: lunch });
    expect(done?.durationMinutes).toBe(25);
    expect(done?.isViolation).toBe(false);
    expect(await breakEventService.openBreak(staff.staffId)).toBeNull();
  });

  it('flags a 45-minute lunch against a 30-minute limit', async () => {
    at('13:00:00');
    const ev = await breakEventService.start({ ...staff, breakType: lunch });
    at('13:45:00');
    const done = await breakEventService.end({ eventId: ev!.id, staffId: staff.staffId, breakType: lunch });
    expect(done?.durationMinutes).toBe(45);
    expect(done?.isViolation).toBe(true);
    expect(done?.violationReason).toContain('Exceeded max 30m');
  });

  it('a repeat start while on break does not create a second break', async () => {
    at('13:00:00');
    const a = await breakEventService.start({ ...staff, breakType: lunch });
    at('13:00:05');
    const b = await breakEventService.start({ ...staff, breakType: lunch });
    expect(b?.id).toBe(a?.id);
    expect(rows).toHaveLength(1);
  });
});
