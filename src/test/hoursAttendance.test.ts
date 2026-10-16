import { describe, it, expect, vi } from 'vitest';
vi.mock('../services/appSettingsService', () => ({ appSettingsService: { getSetting: vi.fn() } }));
import { hoursToStatus, applyHoursRuleTo, effectiveHoursRule, type HoursRuleConfig } from '../utils/hoursAttendance';

const cfg: HoursRuleConfig = { enabled: true, fullDayHours: 8, autoOut: true, overrides: { s2: { mode: 'standard' }, s3: { mode: 'hours', fullDayHours: 10 } } };

// Mirrors the merge engine: IN = earliest of all sources, OUT = latest real punch ≥5 min after IN.
function merge(punches: string[]) {
  const m = [...new Set(punches)].map((t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; }).sort((a, b) => a - b);
  const inM = m[0]; const outs = m.filter((x) => x - inM >= 5);
  const f = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  return { arrivalTime: f(inM), leavingTime: outs.length ? f(Math.max(...outs)) : null };
}

describe('hours-based attendance', () => {
  it('thresholds', () => {
    expect(hoursToStatus(480, 8)).toEqual({ status: 'Present', value: 1 });
    expect(hoursToStatus(720, 8)).toEqual({ status: 'Present', value: 1 }); // no overtime
    expect(hoursToStatus(360, 8)).toEqual({ status: '3/4 Day', value: 0.75 });
    expect(hoursToStatus(240, 8)).toEqual({ status: 'Half Day', value: 0.5 });
    expect(hoursToStatus(200, 8)).toEqual({ status: 'Absent', value: 0 });
  });
  it('per-staff overrides', () => {
    expect(effectiveHoursRule(cfg, 's1')).toEqual({ enabled: true, fullDayHours: 8 });
    expect(effectiveHoursRule(cfg, 's2').enabled).toBe(false);
    expect(effectiveHoursRule(cfg, 's3')).toEqual({ enabled: true, fullDayHours: 10 });
  });
  it('mixed sources: manual IN + device OUT + kiosk double tap -> one row, 3/4 day', () => {
    const t = merge(['09:00', '09:02', '15:10']); // manual, kiosk double-tap, device
    const r = applyHoursRuleTo<any>({ staffId: 's1', status: 'Present', ...t }, cfg);
    expect(t).toEqual({ arrivalTime: '09:00', leavingTime: '15:10' });
    expect(r.status).toBe('3/4 Day'); expect(r.attendanceValue).toBe(0.75);
  });
  it('offline replay of the same punches is idempotent', () => {
    const once = merge(['09:00', '18:30']);
    const replay = merge(['09:00', '18:30', '09:00', '18:30', '18:30']);
    expect(replay).toEqual(once);
    expect(applyHoursRuleTo<any>({ staffId: 's1', ...replay }, cfg).status).toBe('Present');
  });
  it('salary-locked and part-time rows are untouched; standard override keeps shift result', () => {
    expect(applyHoursRuleTo({ staffId: 's1', status: 'Present', salaryOverride: true, arrivalTime: '09:00', leavingTime: '10:00' }, cfg).status).toBe('Present');
    expect(applyHoursRuleTo({ staffId: 's1', status: 'Present', isPartTime: true, arrivalTime: '09:00', leavingTime: '10:00' }, cfg).status).toBe('Present');
    expect(applyHoursRuleTo({ staffId: 's2', status: 'Half Day', arrivalTime: '09:00', leavingTime: '18:00' }, cfg).status).toBe('Half Day');
  });
});

describe('punctuality alert guards', () => {
  it('fires once per staff/day/kind and skips hours-based rows', async () => {
    const { vi } = await import('vitest');
    const svc = (await import('../services/notificationAlertsService')).notificationAlertsService;
    const spy = vi.spyOn(svc, 'notifyPunctuality').mockResolvedValue(null as any);
    const mod: any = await import('../services/attendanceService');
    const t = new Date(); const date = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    const store: Record<string,string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, clear: () => {} };
    if (!(globalThis as any).navigator?.onLine) Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    const rec = { staffId: 'S1', date, arrivalTime: '10:00', appliedRuleDetails: { shiftStart: '09:00', shiftEnd: '18:00' } };
    mod.__notifyPunctuality?.(rec); mod.__notifyPunctuality?.(rec);
    mod.__notifyPunctuality?.({ ...rec, staffId: 'S2', appliedRuleType: 'hours_based' });
    mod.__notifyPunctuality?.({ ...rec, staffId: 'S3', date: '2020-01-01' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
