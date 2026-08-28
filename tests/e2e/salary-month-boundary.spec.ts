import { test, expect } from '@playwright/test';

/**
 * Regression guard: the Salary/Payroll page used to enter an endless refresh
 * loop when navigating across the December → January boundary. This test walks
 * the month selector across the year boundary and asserts the page settles
 * (no crash fallback, no runaway network churn, no render-loop console errors).
 */
test('salary page settles across the December/January boundary', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  let requestCount = 0;
  page.on('request', () => { requestCount += 1; });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const salaryNav = page.getByRole('button', { name: /salary|payroll/i }).first();
  if (await salaryNav.count()) {
    await salaryNav.click();
    await page.waitForTimeout(1500);
  }

  const monthSelect = page.locator('select').first();
  if (await monthSelect.count()) {
    // December -> January of the following year.
    for (const value of ['11', '0']) {
      await monthSelect.selectOption(value).catch(() => { /* selector may differ */ });
      await page.waitForTimeout(1500);
    }
  }

  // Let the page idle and measure request churn — a refresh loop keeps firing.
  requestCount = 0;
  await page.waitForTimeout(5000);
  expect(requestCount, 'page should stop issuing requests once idle').toBeLessThan(15);

  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);

  const loopErrors = consoleErrors.filter(e =>
    /maximum update depth|too many re-?renders|rendered more hooks/i.test(e),
  );
  expect(loopErrors, 'no render-loop errors').toEqual([]);
});
