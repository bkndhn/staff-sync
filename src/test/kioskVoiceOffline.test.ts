// MOCKED browser APIs: speechSynthesis, localStorage, network and the server are all fakes.
// These prove the kiosk logic; real voices/offline behaviour still need a physical phone.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

// ── Fake speech + storage ────────────────────────────────────────────────────
const spoken: { text: string; lang: string }[] = [];
let installedVoices: { lang: string; name: string }[] = [];
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
};
class FakeUtterance { text: string; lang = ''; voice: any = null; rate = 1; constructor(t: string) { this.text = t; } }
(globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
(globalThis as any).window = globalThis;
(globalThis as any).speechSynthesis = {
  getVoices: () => installedVoices,
  cancel: () => {},
  speak: (u: FakeUtterance) => spoken.push({ text: u.text, lang: u.lang }),
};

// ── Fake local queue + server ────────────────────────────────────────────────
const server: any[] = [];
const local = new Map<string, any>();
const uploads: string[] = [];
vi.mock('../lib/db', () => ({
  db: { punchEvents: {
    put: async (e: any) => { local.set(e.id, e); },
    delete: async (id: string) => { local.delete(id); },
    filter: (fn: any) => ({ toArray: async () => [...local.values()].filter(fn) }),
    where: (w: any) => ({ toArray: async () => [...local.values()].filter(e => Object.entries(w).every(([k, v]) => e[k] === v)) }),
  } },
}));
vi.mock('../services/punchPhotoService', () => ({
  punchPhotoService: { upload: async (id: string) => { uploads.push(id); return true; }, viewLinks: async () => ({}) },
}));
vi.mock('../lib/dataApi', () => {
  const builder = () => {
    const filters: [string, any][] = []; let inserted: any[] | null = null;
    const run = () => {
      if (inserted) {
        inserted.forEach(r => server.push({ id: `00000000-0000-0000-0000-${String(server.length + 1).padStart(12, '0')}`, ...r }));
        return { data: server[server.length - 1], error: null };
      }
      return { data: server.filter(r => filters.every(([k, v]) => r[k] === v)), error: null };
    };
    const b: any = {
      select: () => b, order: () => b, limit: () => b, single: () => b,
      eq: (k: string, v: any) => { filters.push([k, v]); return b; },
      insert: (rows: any[]) => { inserted = rows; return b; },
      then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return { dataApi: { from: () => builder() } };
});

import { speakPunch, readVoiceLang } from '../lib/kioskVoice';
import { punchEventService } from '../services/punchEventService';

const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { value: v, configurable: true });

describe('[MOCKED] kiosk language & voice fallback', () => {
  beforeEach(() => { spoken.length = 0; store.clear(); });

  it('speaks Hindi when a Hindi voice is installed', () => {
    installedVoices = [{ lang: 'hi-IN', name: 'Hindi' }];
    speakPunch('in', 'Ravi', 'hi');
    expect(spoken[0].lang).toBe('hi-IN');
    expect(spoken[0].text).toContain('Ravi');
    expect(spoken[0].text).toContain('नमस्ते');
  });

  it('falls back to English when the phone has no Tamil voice', () => {
    installedVoices = [{ lang: 'en-US', name: 'English' }];
    speakPunch('out', 'Priya', 'ta');
    expect(spoken[0]).toEqual({ text: 'Thank you Priya, punched out', lang: 'en-IN' });
  });

  it('stays silent when voice is Off', () => {
    expect(speakPunch('in', 'Ravi', 'off')).toBeNull();
    expect(spoken).toHaveLength(0);
  });

  it('remembers the saved language and ignores bad values', () => {
    store.set('kioskVoiceLang', 'ta');
    expect(readVoiceLang()).toBe('ta');
    store.set('kioskVoiceLang', 'xx');
    expect(readVoiceLang()).toBe('en');
  });
});

describe('[MOCKED] light mode theme', () => {
  it('light mode keeps the blue brand colour', () => {
    const css = readFileSync(path.resolve(__dirname, '../index.css'), 'utf8');
    const light = css.slice(css.indexOf('body.light-theme {'));
    expect(light).toMatch(/--primary-gradient:\s*#2563EB/i);
  });
});

describe('[MOCKED] offline punch + photo catch-up', () => {
  beforeEach(() => { server.length = 0; local.clear(); uploads.length = 0; });

  it('queues offline, then saves once and uploads the photo once on reconnect', async () => {
    setOnline(false);
    await punchEventService.insert({ staffId: 's1', staffName: 'TEST KIOSK 01', date: '2026-10-24', eventTime: '09:00:00', kind: 'in', source: 'face', photo: 'data:image/jpeg;base64,AAA' });
    expect(server).toHaveLength(0);
    setOnline(true);
    await Promise.all([punchEventService.syncPending(), punchEventService.syncPending()]);
    await punchEventService.syncPending();
    expect(server).toHaveLength(1);
    expect(uploads).toEqual([server[0].id]);
    expect(local.size).toBe(0);
  });
});
