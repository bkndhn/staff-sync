import { describe, it, expect } from 'vitest';
import { findTamperedSnapshots } from '../utils/salaryTamperProof';
import type { PayrollSnapshot } from '../types';

const snap = (seal: string | null, currentHash: string | null) =>
  ({ id: 'x', runId: 'r', staffId: 's', staffSnapshot: {} as never, salaryDetail: {} as never, seal, currentHash }) as PayrollSnapshot;

describe('salary tamper seal', () => {
  it('flags a line whose stored data no longer matches its seal', () => {
    const r = findTamperedSnapshots([snap('a', 'a'), snap('a', 'b')]);
    expect(r.tampered).toHaveLength(1);
    expect(r.ok).toBe(false);
  });
  it('treats missing seals as unsealed, not clean', () => {
    const r = findTamperedSnapshots([snap(null, 'a')]);
    expect(r.unsealed).toHaveLength(1);
    expect(r.ok).toBe(false);
  });
  it('passes when every seal matches', () => {
    expect(findTamperedSnapshots([snap('a', 'a')]).ok).toBe(true);
  });
});
