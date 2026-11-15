import { describe, it, expect } from 'vitest';
import { claimRecipients } from '../../supabase/functions/notifications/scheduled';

/** In-memory stand-in for builtin_alert_sends with its (tenant, slot, recipient) primary key. */
function fakeDb(opts: { fail?: boolean } = {}) {
  const rows = new Set<string>();
  return {
    rows,
    from: () => ({
      upsert: (vals: any[]) => ({
        select: async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 5)); // interleave racing runs
          if (opts.fail) return { data: null, error: { message: 'down' } };
          const won = vals.filter((v) => { const k = `${v.tenant_id}|${v.slot_key}|${v.recipient}`; if (rows.has(k)) return false; rows.add(k); return true; });
          return { data: won.map((v) => ({ recipient: v.recipient })), error: null };
        },
      }),
    }),
  };
}

describe('built-in alert already-sent records', () => {
  const people = ['user:a', 'user:b', 'staff:c'];
  it('10 concurrent timer runs give each recipient exactly one alert per slot', async () => {
    const db = fakeDb();
    const runs = await Promise.all(Array.from({ length: 10 }, () => claimRecipients(db, 'T1', '2026-11-15Tpending_phase1@10:00', people)));
    const sends = runs.flatMap((s) => [...s]);
    for (const p of people) expect(sends.filter((x) => x === p)).toHaveLength(1);
  });
  it('a repeated run later sends nothing for the same slot', async () => {
    const db = fakeDb();
    await claimRecipients(db, 'T1', 'S1', people);
    expect((await claimRecipients(db, 'T1', 'S1', people)).size).toBe(0);
  });
  it('a new slot or another company is sent separately', async () => {
    const db = fakeDb();
    await claimRecipients(db, 'T1', 'S1', people);
    expect((await claimRecipients(db, 'T1', 'S2', people)).size).toBe(3);
    expect((await claimRecipients(db, 'T2', 'S1', people)).size).toBe(3);
  });
  it('if the record cannot be saved, nobody is alerted (no double-send risk)', async () => {
    expect((await claimRecipients(fakeDb({ fail: true }), 'T1', 'S1', people)).size).toBe(0);
  });
});
