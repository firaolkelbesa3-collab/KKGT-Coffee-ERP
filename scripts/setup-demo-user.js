#!/usr/bin/env node
/**
 * Creates (or refreshes) the shared "demo" user that the app auto-signs into
 * when VITE_DEMO_MODE=true. Idempotent — safe to re-run.
 *
 * Usage:
 *   1. Make sure SUPABASE_SERVICE_ROLE_KEY is in .env.local
 *      (Supabase Dashboard → Settings → API → service_role; REMOVE after running).
 *
 *   2. Run from project root:
 *        node scripts/setup-demo-user.js
 *
 *   3. Set in Vercel env:
 *        VITE_DEMO_MODE=true
 *      Then redeploy.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  try {
    const content = readFileSync(join(__dirname, '..', '.env.local'), 'utf8');
    const env = {};
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
    return env;
  } catch { return {}; }
}

const env = { ...loadEnvFile(), ...process.env };
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('\n❌  Missing config.\n');
  console.error('Add SUPABASE_SERVICE_ROLE_KEY to .env.local temporarily, then re-run.');
  console.error('Get it from Supabase Dashboard → Settings → API → service_role.\n');
  process.exit(1);
}

// MUST match the constants in src/lib/AuthContext.jsx
const DEMO_EMAIL = 'demo@kkgt.demo';
const DEMO_PASSWORD = 'KkgtDemoPublic2026!';

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function main() {
  console.log(`\nProvisioning demo user at ${url}\n`);

  // 1. Find or create the auth user
  const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw listErr;
  let user = (list?.users || []).find(u => u.email === DEMO_EMAIL);

  if (!user) {
    console.log(`  Creating auth.users row for ${DEMO_EMAIL}...`);
    const { data, error } = await sb.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'KKGT Demo User' },
    });
    if (error) throw error;
    user = data.user;
  } else {
    console.log(`  Refreshing password for existing ${DEMO_EMAIL}...`);
    const { error } = await sb.auth.admin.updateUserById(user.id, {
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
  }

  // 2. Ensure the profile row has role=admin (so the demo can exercise every feature)
  console.log('  Upserting profile row with role=admin...');
  const { error: profErr } = await sb.from('profiles').upsert({
    id: user.id,
    email: DEMO_EMAIL,
    full_name: 'KKGT Demo User',
    role: 'admin',
    is_active: true,
  }, { onConflict: 'id' });
  if (profErr) throw profErr;

  console.log('\n✅  Demo user ready.\n');
  console.log('   email:    ', DEMO_EMAIL);
  console.log('   role:     admin');
  console.log('   user id:  ', user.id);
  console.log('\nNext steps:');
  console.log('  1. Set VITE_DEMO_MODE=true in .env.local (and in Vercel)');
  console.log('  2. Redeploy or restart `npm run dev`');
  console.log('  3. Open the app — visitors will be signed in automatically.\n');
  console.log('⚠   Remove SUPABASE_SERVICE_ROLE_KEY from .env.local now.\n');
}

main().catch(e => {
  console.error('\n❌  Failed:', e.message);
  process.exit(1);
});
