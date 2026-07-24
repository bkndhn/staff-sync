/**
 * Mobile visual regression checks.
 *
 * Runs against a locally running dev server (http://localhost:8080).
 * Captures screenshots + horizontal-overflow measurements at the three most
 * common phone widths (iPhone SE / 5, iPhone 12/13, iPhone Pro Max).
 *
 * Usage (outside CI):
 *   bunx playwright install chromium
 *   bunx playwright test tests/visual/mobile.spec.ts
 *
 * The suite is intentionally auth-free: it covers the Login screen and the
 * password-reset flow that is reachable pre-auth. Authenticated pages
 * (Attendance, Staff, etc.) are exercised by their own component tests and by
 * manual QA against the mobile checklist in docs/MOBILE_RESPONSIVE_CHECKLIST.md.
 */
import { test, expect, devices } from '@playwright/test';

const BREAKPOINTS = [
  { label: 'iphone-se', width: 320, height: 568 },
  { label: 'iphone-13', width: 375, height: 812 },
  { label: 'iphone-pro-max', width: 414, height: 896 },
] as const;

const BASE_URL = process.env.APP_URL ?? 'http://localhost:8080';

for (const bp of BREAKPOINTS) {
  test.describe(`mobile @ ${bp.width}px (${bp.label})`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height }, deviceScaleFactor: 2 });

    test('login page has no horizontal overflow and matches snapshot', async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, 'horizontal overflow px').toBe(0);

      // Primary CTA is at least 44px tall (Apple HIG / Material touch target)
      const cta = page.getByRole('button', { name: /sign in/i }).first();
      const box = await cta.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

      await expect(page).toHaveScreenshot(`login-${bp.label}.png`, {
        maxDiffPixelRatio: 0.02,
        fullPage: false,
      });
    });

    test('staff tab reveals mobile-number field with 16px font (no iOS zoom)', async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);

      const staffTab = page.getByRole('button', { name: /^staff$/i });
      if (await staffTab.count()) {
        await staffTab.first().click();
        const mobileInput = page.getByPlaceholder(/10-digit mobile/i);
        await expect(mobileInput).toBeVisible();
        const fontSize = await mobileInput.evaluate((el) =>
          parseFloat(window.getComputedStyle(el).fontSize)
        );
        expect(fontSize, 'input font-size (must be >=16px to prevent iOS zoom)').toBeGreaterThanOrEqual(16);
      }
    });

    test('logout / confirmation modal fits inside viewport', async ({ page }) => {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
      // Inject a synthetic modal using the app's real modal classes so this
      // test does not depend on being authenticated.
      await page.evaluate(() => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal-content">
            <h3>Confirm</h3>
            <p>Sample modal body used only for visual regression.</p>
            <div style="display:flex;gap:12px">
              <button class="btn-ghost" style="flex:1">Cancel</button>
              <button class="btn-premium" style="flex:1">Confirm</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
      });
      const modal = page.locator('.modal-content').first();
      await expect(modal).toBeVisible();
      const box = await modal.boundingBox();
      expect(box, 'modal has a box').not.toBeNull();
      expect(box!.width).toBeLessThanOrEqual(bp.width - 20);
    });
  });
}

// Reference device profile for local sanity: iPhone 13
test.describe('iphone-13 device profile', () => {
  test.use({ ...devices['iPhone 13'] });
  test('login renders without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    expect(errors, `page errors: ${errors.join('\n')}`).toHaveLength(0);
  });
});
