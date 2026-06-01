import { test, expect } from '@playwright/test';
import { authenticate, ensureTestUserAndSignIn } from '../fixtures/auth.js';

/**
 * Smoke test: every protected route loads without throwing.
 * Catches regressions where a refactor breaks a page's render.
 */
const PAGES = [
  { path: '/', heading: /dashboard/i },
  { path: '/purchase-registration', heading: /purchase/i },
  { path: '/warehouse-receipt', heading: /warehouse/i },
  { path: '/sample-log', heading: /sample/i },
  { path: '/processing-log', heading: /processing/i },
  { path: '/output-report', heading: /output/i },
  { path: '/export-contracts', heading: /export/i },
  { path: '/buyer-inspections', heading: /buyer/i },
  { path: '/stock-report', heading: /stock/i },
  { path: '/bag-ledger', heading: /bag/i },
  { path: '/materials-register', heading: /material/i },
  { path: '/reports', heading: /report/i },
  { path: '/master-data', heading: /master|supplier/i },
  { path: '/activity-log', heading: /activity/i },
  { path: '/permissions', heading: /permission/i },
  { path: '/user-report', heading: /user|activity/i },
  { path: '/purchase-orders-report', heading: /purchase/i },
  { path: '/warehouse-receipt-report', heading: /warehouse/i },
  { path: '/notification-history', heading: /notification/i },
  { path: '/notification-settings', heading: /notification/i },
  { path: '/data-import', heading: /import/i },
  { path: '/data-audit', heading: /audit/i },
];

test.describe('Page render smoke test (admin)', () => {
  test.beforeAll(async () => {
    await ensureTestUserAndSignIn('admin');
  });

  for (const p of PAGES) {
    test(`renders ${p.path} without errors`, async ({ page }) => {
      const consoleErrors = [];
      page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });

      await authenticate(page, 'admin');
      await page.goto(p.path);
      await page.waitForLoadState('networkidle');

      // Heading should be visible somewhere
      await expect(page.getByRole('heading', { name: p.heading }).first()).toBeVisible({ timeout: 15000 });

      // Filter out the known harmless React Router future-flag warnings
      const real = consoleErrors.filter(e =>
        !/React Router Future Flag/.test(e) &&
        !/Missing `Description`/.test(e) &&  // shadcn DialogContent a11y warning
        !/aria-describedby/.test(e)
      );
      expect(real, `Console errors on ${p.path}: ${real.join('\n')}`).toEqual([]);
    });
  }
});
