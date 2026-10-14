import { describe, it, expect, vi, beforeEach } from 'vitest';

// MOCKED: in-memory tables standing in for the data-api. Every row is TEST_FLEX_PETTY_* and is wiped after each test.
const tables: Record<string, any[]> = {};
let seq = 0;
const T = (n: string) => (tables[n] ||= []);

vi.mock('../lib/db', () => ({
  db: { punchEvents: {
    put: async () => {}, delete: async () => {},
    filter: () => ({ toArray: async () => [] }), where: () => ({ toArray: async () => [] }),
  } },
}));

vi.mock('../lib/dataApi', () => {
  const builder = (table: string) => {
    const f: ((r: any) => boolean)[] = [];
    let op = 'select'; let vals: any; let single = false; let maybe = false;
    const run = () => {
      const rows = T(table);
      if (op === 'insert') {
        const list = (Array.isArray(vals) ? vals : [vals]).map(v => ({ id: `id_${++seq}`, created_at: new Date().toISOString(), ...v }));
        rows.push(...list);
        return { data: single ? list[0] : list, error: null };
      }
      const hit = rows.filter(r => f.every(fn => fn(r)));
      if (op === 'update') { hit.forEach(r => Object.assign(r, vals)); return { data: hit, error: null }; }
      if (op === 'delete') { tables[table] = rows.filter(r => !hit.includes(r)); return { data: null, error: null }; }
      if (single || maybe) return { data: hit[0] ?? null, error: null };
      return { data: hit, error: null };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b,
      eq: (k: string, v: any) => { f.push(r => r[k] === v); return b; },
      ilike: (k: string, p: string) => {
        const re = new RegExp('^' + p.replace(/\\([%_])/g, '\u0000$1').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/(?<!\u0000)%/g, '.*').replace(/(?<!\u0000)_/g, '.').replace(/\u0000/g, '') + '$', 'i');
        f.push(r => re.test(r[k] ?? '')); return b;
      },
      insert: (v: any) => { op = 'insert'; vals = v; return b; },
      update: (v: any) => { op = 'update'; vals = v; return b; },
      delete: () => { op = 'delete'; return b; },
      single: () => { single = true; return b; },
      maybeSingle: () => { maybe = true; return b; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { dataApi: { from: (t: string) => builder(t) } };
});

import { punchEventService } from '../services/punchEventService';
import { pettyCashService } from '../services/pettyCashService';
import { formatPunchRange, type PunchTimes } from '../utils/pettyCashExport';

const DATE = '2026-10-13';
const A = { staffId: 'pt_TEST_FLEX_PETTY_A', staffName: 'TEST FLEX PETTY A', location: 'Godown' };
const B = { staffId: 'pt_TEST_FLEX_PETTY_B', staffName: 'TEST FLEX PETTY B', location: 'Pant Godown' };

// Same branch rule the Petty Cash page uses to build punch times for one branch.
const punchTimesFor = async (branch: string): Promise<PunchTimes> => {
  const map: PunchTimes = {};
  for (const s of [A, B]) {
    if (s.location.toLowerCase() !== branch.toLowerCase()) continue;
    const sum = punchEventService.summarize(await punchEventService.listByDate(DATE, s.staffId));
    map[s.staffId] = { in: sum.firstIn, out: sum.lastOut };
  }
  return map;
};

describe('kiosk → petty cash (TEST_FLEX_PETTY_*) — MOCKED data layer', () => {
  beforeEach(() => {
    for (const k of Object.keys(tables)) delete tables[k];
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('shows kiosk IN/OUT in the right branch, saves, reloads history, stays isolated, cleans up', async () => {
    // 1. Kiosk punches (with a break for A)
    for (const [t, k] of [['09:15:00', 'in'], ['13:00:00', 'out'], ['13:30:00', 'in'], ['18:45:00', 'out']] as const)
      await punchEventService.insert({ ...A, date: DATE, eventTime: t, kind: k, source: 'kiosk' });
    await punchEventService.insert({ ...B, date: DATE, eventTime: '10:00:00', kind: 'in', source: 'kiosk' });
    await punchEventService.insert({ ...B, date: DATE, eventTime: '19:30:00', kind: 'out', source: 'kiosk' });

    // 2. Times on the Godown sheet
    const times = await punchTimesFor('Godown');
    expect(formatPunchRange(times, A.staffId)).toBe('IN 09:15 AM / OUT 06:45 PM');
    expect(formatPunchRange(times, B.staffId)).toBe('');

    // 3. Save both branch sheets
    const mk = (s: typeof A, loc: string) => ({
      location: loc, date: DATE, template_type: 'godown' as const, received_amount: 1000,
      staff_meals: [{ staff_id: s.staffId, staff_name: s.staffName, designation: 'Flex Staff', staff_type: 'part-time' as const, attendance_status: 'F', amount: 65 }],
      expenses: [{ category: 'custom', label: 'TEST tea', amount: 40 }],
      transport_logistics: [{ transport_name: 'TEST VRL', count: 1, freight: 100, auto: 0, hamali: 20, total: 120 }],
      part_time_meal_total: 65, meal_total: 65, expenses_total: 40, transport_total: 120, total_expense: 160, balance: 840,
    });
    const savedA = await pettyCashService.saveSheet(mk(A, 'Godown'));
    await pettyCashService.saveSheet(mk(B, 'Pant Godown'));
    expect(savedA.id).toBeTruthy();

    // Re-save must update, not duplicate
    await pettyCashService.saveSheet({ ...savedA, received_amount: 1200 });
    expect(T('petty_cash_sheets')).toHaveLength(2);
    expect(T('petty_cash_staff_meals')).toHaveLength(2);

    // 4. Reload history
    const histA = await pettyCashService.getSheetHistory('godown');
    expect(histA).toHaveLength(1);
    expect(histA[0].location).toBe('Godown');
    expect(histA[0].received_amount).toBe(1200);
    expect(histA[0].staff_meals[0].staff_name).toBe('TEST FLEX PETTY A');
    expect(histA[0].expenses).toHaveLength(1);
    expect(histA[0].transport_logistics[0].total).toBe(120);

    // 5. Branch isolation
    const histB = await pettyCashService.getSheetHistory('Pant Godown');
    expect(histB).toHaveLength(1);
    expect(histB[0].staff_meals[0].staff_name).toBe('TEST FLEX PETTY B');
    expect(await pettyCashService.getSheetHistory('Showroom')).toHaveLength(0);

    // 6. Cleanup
    for (const k of Object.keys(tables)) tables[k] = T(k).filter(r => !JSON.stringify(r).includes('TEST'));
    const sheetIds = new Set(T('petty_cash_sheets').map(s => s.id));
    tables.petty_cash_sheets = [];
    for (const k of ['petty_cash_expenses', 'petty_cash_transports']) tables[k] = T(k).filter(r => !sheetIds.has(r.sheet_id));
    expect(Object.values(tables).every(r => r.length === 0)).toBe(true);
  });
});
