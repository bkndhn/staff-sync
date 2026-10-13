import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory "server" table and local queue — all rows are TEST_FLEX_* and vanish after the run.
const server: any[] = [];
const local = new Map<string, any>();
let failNextInsertReply = false;

vi.mock('../lib/db', () => ({
  db: {
    punchEvents: {
      put: async (e: any) => { local.set(e.id, e); },
      delete: async (id: string) => { local.delete(id); },
      filter: (fn: any) => ({ toArray: async () => [...local.values()].filter(fn) }),
      where: (w: any) => ({ toArray: async () => [...local.values()].filter(e => Object.entries(w).every(([k, v]) => e[k] === v)) }),
    },
  },
}));

vi.mock('../lib/dataApi', () => {
  const builder = () => {
    const filters: [string, any][] = [];
    let inserted: any[] | null = null;
    const run = () => {
      if (inserted) {
        inserted.forEach(r => server.push({ id: `srv_${server.length + 1}`, created_at: new Date().toISOString(), ...r }));
        if (failNextInsertReply) { failNextInsertReply = false; return { data: null, error: { message: 'network lost' } }; }
        return { data: server[server.length - 1], error: null };
      }
      return { data: server.filter(r => filters.every(([k, v]) => r[k] === v)), error: null };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b,
      eq: (k: string, v: any) => { filters.push([k, v]); return b; },
      insert: (rows: any[]) => { inserted = rows; return b; },
      single: () => b,
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { dataApi: { from: () => builder() } };
});

import { punchEventService } from '../services/punchEventService';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });
const base = { staffId: 'pt_TEST_FLEX_AUTO_01', staffName: 'TEST FLEX AUTO 01', location: 'Godown', date: '2026-10-13', source: 'kiosk' };

describe('kiosk → portal punch flow (TEST_FLEX_AUTO_01)', () => {
  beforeEach(() => { server.length = 0; local.clear(); setOnline(true); });

  it('records IN, break (OUT/IN) and final OUT online with correct hours', async () => {
    for (const [t, k] of [['09:00:00', 'in'], ['13:00:00', 'out'], ['13:30:00', 'in'], ['18:30:00', 'out']] as const)
      await punchEventService.insert({ ...base, eventTime: t, kind: k });
    expect(server).toHaveLength(4);
    const s = punchEventService.summarize(await punchEventService.listByDate(base.date, base.staffId));
    expect(s.firstIn).toBe('09:00:00');
    expect(s.lastOut).toBe('18:30:00');
    expect(s.minutes).toBe(9 * 60 - 30 + 30); // 4h + 5h = 9h, 30-min break excluded
  });

  it('queues offline and replays once, even with parallel syncs', async () => {
    setOnline(false);
    await punchEventService.insert({ ...base, eventTime: '09:05:00', kind: 'in' });
    await punchEventService.insert({ ...base, eventTime: '18:10:00', kind: 'out' });
    expect(server).toHaveLength(0);
    expect(local.size).toBe(2);
    setOnline(true);
    const [a, b, c] = await Promise.all([punchEventService.syncPending(), punchEventService.syncPending(), punchEventService.syncPending()]);
    expect(a).toBe(2); expect(b).toBe(2); expect(c).toBe(2); // same single run
    expect(server).toHaveLength(2);
    expect(local.size).toBe(0);
    expect(await punchEventService.syncPending()).toBe(0);
    expect(server).toHaveLength(2);
  });

  it('does not duplicate when the server saved but the reply was lost', async () => {
    failNextInsertReply = true;
    await punchEventService.insert({ ...base, eventTime: '09:00:00', kind: 'in' });
    expect(server).toHaveLength(1);      // saved on server
    expect(local.size).toBe(1);          // still looks pending locally
    await punchEventService.syncPending();
    expect(server).toHaveLength(1);      // no duplicate
    expect(local.size).toBe(0);
  });
});
