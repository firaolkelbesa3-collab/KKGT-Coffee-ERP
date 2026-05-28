/**
 * Loads env vars from .env.local (no dotenv dep needed).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function load() {
  try {
    const content = readFileSync(join(__dirname, '..', '..', '.env.local'), 'utf8');
    const out = {};
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return out;
  } catch { return {}; }
}

const env = { ...load(), ...process.env };

export const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
export const TEST_USER_EMAIL = env.PLAYWRIGHT_TEST_EMAIL || 'playwright-test@kkgt.test';
export const TEST_USER_PASSWORD = env.PLAYWRIGHT_TEST_PASSWORD || 'PlaywrightTest!2026';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing from .env.local');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY missing from .env.local. Add it temporarily for the test run, ' +
    'then remove. Get it from Supabase Dashboard → Settings → API → service_role.'
  );
}
