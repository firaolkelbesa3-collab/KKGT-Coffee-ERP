import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for KKGT Coffee Flow.
 *
 * - Auto-starts `npm run dev` on http://localhost:5173 before tests run.
 * - Reuses an existing dev server if one is already running.
 * - Tests authenticate via Supabase service role (no Google OAuth needed) —
 *   see tests/fixtures/auth.js.
 *
 * Required env vars (read from .env.local):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY  ← temporary, just for tests
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,           // serialize to avoid trigger race conditions
  workers: 1,                     // single worker for the same reason
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
