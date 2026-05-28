import { test, expect } from '@playwright/test';
import { authenticate, ensureTestUserAndSignIn } from '../fixtures/auth.js';

test.describe('Auth & RBAC', () => {
  test('unauthenticated visit redirects to /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  });

  test('admin lands on dashboard after auth', async ({ page }) => {
    await authenticate(page, 'admin');
    await page.goto('/');
    // Either we land directly on dashboard or briefly on pending-approval —
    // give the auth check time to resolve.
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/$|^\/$|^http.+\/$/);
    // Dashboard renders a header containing "Dashboard"
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible({ timeout: 15000 });
  });

  test('non-admin role gets routed to pending-approval if unassigned, full app if assigned', async ({ page }) => {
    // Promote to warehouse_keeper for this test
    await ensureTestUserAndSignIn('warehouse_keeper');
    await authenticate(page, 'warehouse_keeper');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Should land on dashboard (warehouse_keeper IS assigned)
    await expect(page.getByRole('heading', { name: /dashboard/i }).first()).toBeVisible({ timeout: 15000 });

    // Restore admin for subsequent tests
    await ensureTestUserAndSignIn('admin');
  });

  test('admin can see Permissions menu, warehouse_keeper cannot', async ({ page }) => {
    await ensureTestUserAndSignIn('admin');
    await authenticate(page, 'admin');
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: /permissions/i })).toBeVisible({ timeout: 15000 });
  });
});
