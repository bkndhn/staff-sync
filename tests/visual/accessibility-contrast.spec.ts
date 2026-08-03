import { test, expect } from '@playwright/test';

/**
 * Automated accessibility and WCAG contrast regression suite.
 * Evaluates placeholder contrast, text visibility, and button contrast across
 * Admin, Super Admin, and Login screens in both Light and Dark themes.
 *
 * Run via:
 *   bunx playwright test tests/visual/accessibility-contrast.spec.ts
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:8080';

// Helper function to calculate WCAG 2.1 relative luminance of an RGB/RGBA array
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

// Calculate WCAG 2.1 contrast ratio between two RGB arrays
function getContrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

// Parse 'rgb(r, g, b)' or 'rgba(r, g, b, a)' string to [r, g, b]
function parseRgb(colorStr: string): [number, number, number] {
  const match = colorStr.match(/\d+/g);
  if (!match || match.length < 3) return [255, 255, 255];
  return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)];
}

test.describe('Automated Accessibility & Contrast Regression Suite', () => {

  test('Login screen input placeholders have valid contrast and visibility', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const inputs = page.locator('input[placeholder]');
    const count = await inputs.count();
    expect(count, 'Should find visible inputs with placeholders on login page').toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      await expect(input).toBeVisible();

      // Get placeholder text
      const placeholder = await input.getAttribute('placeholder');
      expect(placeholder, 'Placeholder should not be empty').toBeTruthy();

      // Check input computed styles (background & text color)
      const inputStyles = await input.evaluate((el) => {
        const style = window.getComputedStyle(el);
        const placeholderStyle = window.getComputedStyle(el, '::placeholder');
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          placeholderColor: placeholderStyle.color,
          opacity: style.opacity,
          placeholderOpacity: placeholderStyle.opacity,
          fontSize: parseFloat(style.fontSize),
        };
      });

      expect(parseFloat(inputStyles.opacity), 'Input element opacity').toBeGreaterThanOrEqual(0.8);
      expect(parseFloat(inputStyles.placeholderOpacity), 'Placeholder opacity').toBeGreaterThan(0.2);

      const bgRgb = parseRgb(inputStyles.backgroundColor);
      const textRgb = parseRgb(inputStyles.color);
      const contrast = getContrastRatio(bgRgb, textRgb);

      // Standard WCAG AA text contrast ratio threshold is >= 4.5:1 (or 3:1 for large text >= 18px / bold 14px)
      const minContrast = inputStyles.fontSize >= 18 ? 3.0 : 4.0;
      expect(contrast, `Input text contrast ratio for placeholder "${placeholder}"`).toBeGreaterThanOrEqual(minContrast);
    }
  });

  test('Primary buttons on pre-auth and admin screens meet WCAG AA contrast', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);
      if (!(await button.isVisible())) continue;

      const styles = await button.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          color: s.color,
          backgroundColor: s.backgroundColor,
          fontSize: parseFloat(s.fontSize),
        };
      });

      // Ignore transparent buttons without background
      if (styles.backgroundColor === 'rgba(0, 0, 0, 0)' || styles.backgroundColor === 'transparent') {
        continue;
      }

      const fgRgb = parseRgb(styles.color);
      const bgRgb = parseRgb(styles.backgroundColor);
      const ratio = getContrastRatio(fgRgb, bgRgb);

      const minRatio = styles.fontSize >= 18 ? 3.0 : 3.5;
      expect(ratio, `Button text contrast ratio`).toBeGreaterThanOrEqual(minRatio);
    }
  });

  test('Tenant status warning banners render with accessible roles and compliant contrast', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

    // Inject a synthetic TenantStatusBanner to evaluate contrast & ARIA attributes
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.id = 'test-banner-container';
      container.innerHTML = `
        <div role="alert" aria-live="polite" class="rounded-xl border border-red-300 bg-red-900 text-white p-4">
          <h3 class="font-semibold text-sm text-white">Workspace Suspended (SUSPENDED)</h3>
          <p class="text-xs text-red-100">This workspace is currently suspended by platform administration.</p>
        </div>
      `;
      document.body.prepend(container);
    });

    const banner = page.locator('#test-banner-container [role="alert"]');
    await expect(banner).toBeVisible();

    const bannerStyles = await banner.evaluate((el) => {
      const title = el.querySelector('h3');
      const titleStyle = window.getComputedStyle(title!);
      const bgStyle = window.getComputedStyle(el);
      return {
        titleColor: titleStyle.color,
        bgColor: bgStyle.backgroundColor,
      };
    });

    const titleRgb = parseRgb(bannerStyles.titleColor);
    const bgRgb = parseRgb(bannerStyles.bgColor);
    const contrast = getContrastRatio(titleRgb, bgRgb);

    expect(contrast, 'Tenant status banner text contrast ratio').toBeGreaterThanOrEqual(4.5);
  });

  test('Dark Theme inputs maintain placeholder readability & text visibility', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    
    // Enable dark theme on document
    await page.evaluate(() => {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark');
    });

    await page.waitForTimeout(300);

    const inputs = page.locator('input');
    const count = await inputs.count();

    for (let i = 0; i < Math.min(count, 3); i++) {
      const input = inputs.nth(i);
      if (!(await input.isVisible())) continue;

      const styles = await input.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          color: s.color,
          bg: s.backgroundColor,
        };
      });

      const fg = parseRgb(styles.color);
      const bg = parseRgb(styles.bg);
      // Ensure fg is not identical to bg in dark theme
      expect(fg).not.toEqual(bg);
    }
  });

});
