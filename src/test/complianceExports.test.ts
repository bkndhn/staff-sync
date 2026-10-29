import { describe, it, expect } from 'vitest';
import { buildEpfoEcr, buildEsicReturn } from '../utils/complianceExports';

const staff = (o: any) => ({ id: 's1', name: 'Ravi Kumar', isActive: true, ...o }) as any;
const det = (o: any) => ({ staffId: 's1', grossSalary: 18000, basicEarned: 12000, hraEarned: 6000, leaveDays: 2, presentDays: 26, halfDays: 0,
  statutoryBreakdown: [{ key: 'pf', amount: 1800 }, { key: 'esi', amount: 135 }], ...o }) as any;

describe('EPFO ECR 2.0', () => {
  it('builds an 11-field #~# line with wages capped at 15,000', () => {
    const f = buildEpfoEcr([det({})], [staff({ pfNumber: '100123456789', dob: '1990-01-01' })], 9, 2026);
    expect(f.content).toBe('100123456789#~#RAVI KUMAR#~#18000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0');
  });
  it('sends no EPS for staff aged 58 or more; full 12% goes to EPF', () => {
    const f = buildEpfoEcr([det({})], [staff({ pfNumber: '100123456789', dob: '1960-01-01' })], 9, 2026);
    expect(f.content.split('#~#').slice(4, 9)).toEqual(['0', '15000', '1800', '0', '1800']);
  });
  it('rejects a UAN that is not 12 digits', () => {
    const f = buildEpfoEcr([det({})], [staff({ pfNumber: 'MH/123' })], 9, 2026);
    expect(f.rowCount).toBe(0);
    expect(f.skipped[0].reason).toMatch(/12 digits/);
  });
  it('caps NCP days at days in month', () => {
    const f = buildEpfoEcr([det({ leaveDays: 45 })], [staff({ pfNumber: '100123456789' })], 1, 2026);
    expect(f.content.split('#~#')[9]).toBe('28');
  });
});

describe('ESIC portal return', () => {
  it('has exactly 6 columns and no contribution column', () => {
    const f = buildEsicReturn([det({})], [staff({ esiNumber: '3112345678' })], 9, 2026);
    const [head, row] = f.content.split('\r\n');
    expect(head.split(',').length).toBe(6);
    expect(row).toBe('3112345678,RAVI KUMAR,26,18000,,');
    expect(f.totalAmount).toBe(135);
  });
  it('uses reason 1 for on-leave and 2 with last day for staff who left', () => {
    const z = det({ presentDays: 0 });
    expect(buildEsicReturn([z], [staff({ esiNumber: '3112345678' })], 9, 2026).content.split('\r\n')[1]).toBe('3112345678,RAVI KUMAR,0,0,1,');
    const left = buildEsicReturn([z], [staff({ esiNumber: '3112345678', isActive: false })], 9, 2026, { s1: '2026-10-05' });
    expect(left.content.split('\r\n')[1]).toBe('3112345678,RAVI KUMAR,0,0,2,05/10/2026');
  });
  it('skips gross above 21,000 and bad IP numbers', () => {
    expect(buildEsicReturn([det({ grossSalary: 25000 })], [staff({ esiNumber: '3112345678' })], 9, 2026).rowCount).toBe(0);
    expect(buildEsicReturn([det({})], [staff({ esiNumber: '123' })], 9, 2026).skipped[0].reason).toMatch(/10 digits/);
  });
});
