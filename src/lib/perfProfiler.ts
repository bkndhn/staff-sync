/**
 * perfProfiler — lightweight in-app profiler.
 *
 * Enable by appending `?perf=1` to the URL. Records rolling averages for
 * arbitrary named timings via performance.mark / performance.measure.
 *
 * Zero cost when disabled (guards short-circuit).
 */

const isEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('perf') === '1';
  } catch {
    return false;
  }
};

const ENABLED = isEnabled();

type Sample = { count: number; total: number; last: number; max: number };
const samples = new Map<string, Sample>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });

let notifyRaf = 0;
const scheduleNotify = () => {
  if (notifyRaf) return;
  notifyRaf = requestAnimationFrame(() => { notifyRaf = 0; notify(); });
};

export const perfEnabled = () => ENABLED;

/** Mark start of a measurement. Returns an "end" fn to call when done. */
export const perfStart = (name: string): (() => void) => {
  if (!ENABLED) return () => {};
  const t0 = performance.now();
  return () => {
    const dt = performance.now() - t0;
    const s = samples.get(name) || { count: 0, total: 0, last: 0, max: 0 };
    s.count += 1;
    s.total += dt;
    s.last = dt;
    if (dt > s.max) s.max = dt;
    samples.set(name, s);
    scheduleNotify();
  };
};

/** One-shot record of a value (e.g. embedding count, heap). */
export const perfRecord = (name: string, value: number) => {
  if (!ENABLED) return;
  const s = samples.get(name) || { count: 0, total: 0, last: 0, max: 0 };
  s.count += 1;
  s.total += value;
  s.last = value;
  if (value > s.max) s.max = value;
  samples.set(name, s);
  scheduleNotify();
};

export interface PerfSnapshot {
  name: string;
  last: number;
  avg: number;
  max: number;
  count: number;
}

export const perfSnapshot = (): PerfSnapshot[] => {
  const out: PerfSnapshot[] = [];
  samples.forEach((s, name) => {
    out.push({ name, last: s.last, avg: s.total / Math.max(1, s.count), max: s.max, count: s.count });
  });
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

export const perfReset = () => { samples.clear(); notify(); };

export const perfSubscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};

/** Best-effort JS heap read (Chromium only). */
export const readHeapMB = (): number | null => {
  try {
    const mem = (performance as any).memory;
    if (mem?.usedJSHeapSize) return Math.round(mem.usedJSHeapSize / 1048576);
  } catch { /* ignore */ }
  return null;
};
