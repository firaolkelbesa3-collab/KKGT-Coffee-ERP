/**
 * Auth fixture for Playwright.
 *
 * Bypasses Google OAuth by:
 *   1. Using the Supabase admin API to ensure a test user exists with a known password.
 *   2. Signing in with email+password to get a session JWT.
 *   3. Injecting the session into localStorage before the page loads.
 *
 * The AuthContext on mount reads the session from localStorage and renders
 * the app as if the user clicked through Google.
 *
 * Test user gets `role = 'admin'` so they can exercise every flow.
 */
import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
} from './env.js';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let cachedSession = null;

export async function ensureTestUserAndSignIn(role = 'admin') {
  if (cachedSession && cachedSession.role === role) return cachedSession;

  // 1. Find or create the auth user
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = (list?.users || []).find(u => u.email === TEST_USER_EMAIL);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Playwright Test User' },
    });
    if (error) throw new Error(`Failed to create test user: ${error.message}`);
    user = data.user;
  } else {
    // Refresh password in case it drifted
    await admin.auth.admin.updateUserById(user.id, {
      password: TEST_USER_PASSWORD,
      email_confirm: true,
    });
  }

  // 2. Ensure the profile row has the requested role
  await admin.from('profiles').upsert({
    id: user.id,
    email: TEST_USER_EMAIL,
    full_name: 'Playwright Test User',
    role,
    is_active: true,
  }, { onConflict: 'id' });

  // 3. Sign in to get a real session
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: signIn, error: signErr } = await anon.auth.signInWithPassword({
    email: TEST_USER_EMAIL,
    password: TEST_USER_PASSWORD,
  });
  if (signErr) throw new Error(`Sign-in failed: ${signErr.message}`);

  cachedSession = { session: signIn.session, user, role };
  return cachedSession;
}

/**
 * Inject the Supabase session into localStorage before the page navigates.
 * Call inside a test before `page.goto(...)`.
 */
export async function authenticate(page, role = 'admin') {
  const { session } = await ensureTestUserAndSignIn(role);
  const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  const payload = JSON.stringify(session);

  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, value);
  }, { key: storageKey, value: payload });
}

/**
 * Convenience: clean up any rows our tests created so re-runs start fresh.
 * Identifies test rows by a marker in their description / coffee_code.
 */
export async function cleanupTestData(marker = 'PWTEST') {
  // Best-effort delete by marker — ignore errors.
  await admin.from('purchase_records').delete().ilike('coffee_code', `%${marker}%`);
  await admin.from('warehouse_receipts').delete().ilike('coffee_code', `%${marker}%`);
  await admin.from('suppliers').delete().ilike('supplier_name', `%${marker}%`);
}
