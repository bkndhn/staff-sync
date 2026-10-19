import type { PayrollSnapshot } from '../types';

/**
 * A payroll line is tampered when the server seal (stamped at generation)
 * no longer matches the server hash of the stored data. Lines without a
 * seal are reported as unsealed, never as clean.
 */
export function findTamperedSnapshots(snaps: PayrollSnapshot[]) {
  const tampered: PayrollSnapshot[] = [];
  const unsealed: PayrollSnapshot[] = [];
  for (const s of snaps) {
    if (!s.seal || !s.currentHash) unsealed.push(s);
    else if (s.seal !== s.currentHash) tampered.push(s);
  }
  return { tampered, unsealed, ok: tampered.length === 0 && unsealed.length === 0 };
}
