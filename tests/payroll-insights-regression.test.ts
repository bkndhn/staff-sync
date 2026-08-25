import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Payroll insights render-loop regression', () => {
  it('keeps Section stable and guards report notifications by content signature', () => {
    const source = readFileSync('src/components/PayrollInsightsPanel.tsx', 'utf8');
    const componentStart = source.indexOf('export const PayrollInsightsPanel');
    const sectionStart = source.indexOf('const Section:');

    expect(sectionStart).toBeGreaterThanOrEqual(0);
    expect(sectionStart).toBeLessThan(componentStart);
    expect(source).toContain('lastSignatureRef.current === reportSignature');
    expect(source).toContain('[reportSignature]');
    expect(source).not.toContain('[report, onReport]');
  });
});