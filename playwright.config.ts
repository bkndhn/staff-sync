import { defineConfig } from '@playwright/test';

/**
 * Playwright config for mobile visual regression.
 * Snapshots live under tests/visual/__screenshots__/.
 * Run: `bunx playwright test -c playwright.config.ts`
 */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  snapshotDir: './tests/visual/__screenshots__',
});
