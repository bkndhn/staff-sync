import { readFileSync } from 'fs';
import { test, expect } from 'vitest';
// The app keeps its own copy so the website builds without the server folder; both copies must match.
test('app fingerprint rules match the server copy', () => {
  const strip = (s: string) => s.split('\n').filter(l => !l.startsWith('// Copy of')).join('\n');
  expect(strip(readFileSync('src/utils/fingerprintPunch.ts', 'utf8'))).toBe(readFileSync('supabase/functions/_shared/fingerprintPunch.ts', 'utf8'));
});
