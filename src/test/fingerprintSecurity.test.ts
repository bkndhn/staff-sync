import { describe, it, expect } from 'vitest';
import { canManageKeyFor, testTouchWrites, FP_STATIONS } from '../../supabase/functions/_shared/fingerprintAccess';

const staff = { tenantId: 'T1', location: 'Chennai' };
describe('fingerprint key access (server rules)', () => {
  it('blocks another company even for admins', () => {
    expect(canManageKeyFor({ role: 'admin', tenantId: 'T2', location: null }, staff).ok).toBe(false);
  });
  it('lets a company admin manage any branch', () => {
    expect(canManageKeyFor({ role: 'admin', tenantId: 'T1', location: 'Madurai' }, staff).ok).toBe(true);
  });
  it('limits a manager to their own branch', () => {
    expect(canManageKeyFor({ role: 'manager', tenantId: 'T1', location: 'Chennai' }, staff).ok).toBe(true);
    expect(canManageKeyFor({ role: 'manager', tenantId: 'T1', location: 'Madurai' }, staff).ok).toBe(false);
    expect(canManageKeyFor({ role: 'manager', tenantId: 'T1', location: null }, staff).ok).toBe(false);
  });
  it('refuses supervisors and staff for enrol/test/revoke', () => {
    for (const role of ['supervisor', 'floor_supervisor', 'staff']) {
      expect(canManageKeyFor({ role, tenantId: 'T1', location: 'Chennai' }, staff).ok).toBe(false);
    }
  });
  it('treats a revoked (missing) key as not found', () => {
    expect(canManageKeyFor({ role: 'admin', tenantId: 'T1', location: null }, null).ok).toBe(false);
  });
  it('test touch never writes attendance; only real touches do', () => {
    expect(testTouchWrites(true)).toBe(false);
    expect(testTouchWrites(undefined)).toBe(true);
    expect(FP_STATIONS).not.toContain('staff');
  });
});
