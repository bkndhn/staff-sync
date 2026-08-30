import { test, expect, devices } from '@playwright/test';

/**
 * Mobile-only regression: the app's light theme must stay readable even when the
 * phone's OS is set to dark mode. Tailwind is configured with darkMode: 'class',
 * so `prefers-color-scheme: dark` must NOT dim dialog text.
 *
 * Run via:
 *   bunx playwright test tests/visual/mobile-dialog-contrast.spec.ts
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:8080';
const MIN_CONTRAST = 4.5; // WCAG AA for body text

const luminance = (r: number, g: number, b: number) => {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const parseRgb = (value: string): [number, number, number] => {
  const m = value.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return [255, 255, 255];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
};

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const l1 = luminance(...a);
  const l2 = luminance(...b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

test.use({ ...devices['Pixel 5'], colorScheme: 'dark' });

test.describe('Mobile light theme stays readable in OS dark mode', () => {
  test('html does not gain the dark class from OS preference', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(isDark, 'OS dark mode must not force the app into dark theme').toBe(false);
  });

  test('dialog text meets AA contrast against its own background', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('theme', 'light'));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    // Render a dialog using the app's own CustomDialog markup classes.
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'contrast-probe';
      host.innerHTML = `
        <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div class="bg-white dark:bg-gray-900 rounded-2xl p-6 w-[90%] max-w-sm">
            <h3 data-probe="title" class="text-lg font-semibold text-gray-900 dark:text-white">Confirm action</h3>
            <p data-probe="body" class="mt-2 text-sm text-gray-700 dark:text-gray-300">This change cannot be undone.</p>
          </div>
        </div>`;
      document.body.appendChild(host);
    });

    for (const probe of ['title', 'body']) {
      const colours = await page.evaluate((name) => {
        const el = document.querySelector(`[data-probe="${name}"]`) as HTMLElement;
        const panel = el.closest('div') as HTMLElement;
        return {
          fg: getComputedStyle(el).color,
          bg: getComputedStyle(panel).backgroundColor,
        };
      }, probe);

      const ratio = contrast(parseRgb(colours.fg), parseRgb(colours.bg));
      expect(ratio, `${probe} contrast ${ratio.toFixed(2)} (${colours.fg} on ${colours.bg})`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }

    await page.evaluate(() => document.getElementById('contrast-probe')?.remove());
  });
});
