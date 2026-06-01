# Base44 → Supabase + Vercel Migration Runbook

Written from real lessons learned migrating KKGT Coffee Flow. Every gotcha listed
here is one that bit us during the v1 migration. Follow this for the next
migration and you should never see those bugs again.

**Time estimate for a similar-sized app (25 entities, ~30 pages, ~200 components):**
~6-10 hours if everything goes smoothly. Plan for 2-3 days with debugging.

**What's in here:**
- **Phases 0–11** — the core migration (diagnosis → schema → RLS → auth → client → Edge Functions → deploy → testing → ops).
- **Phases 12–17** — features added after v1 and their landmines: branded **reports** (exceljs/jsPDF), **Document Vault** (Supabase Storage), **mobile-friendly** rules, **charts** (recharts), **Data Audit / Excel reconciliation**, and **demo mode**.
- **Bug index** — every error we hit with its one-line fix.
- **Offline support** — PWA + sync-queue design and its landmines.
- **Tech-stack cheat sheet** + dead-deps-to-delete list.

---

## Phase 0 — Pre-flight diagnosis (30 min)

Before writing any code, determine what's actually present vs missing.

### 0.1 — Is `base44Client.js` already a Supabase shim?

Open `src/api/base44Client.js`. There are two shapes:

| Shape | What it means |
|---|---|
| `import { createClient } from '@base44/sdk'` or similar | **True Base44 app.** Full client rewrite needed. |
| `import { createClient } from '@supabase/supabase-js'` | **Already shimmed** — only the backend pieces (DB schema, Edge Functions, Storage) are missing. |

KKGT was already shimmed — saved us weeks of work. Don't assume the worst until you check.

### 0.2 — Does the Supabase database have tables?

```sql
-- Run in Supabase SQL Editor
select table_name from information_schema.tables
where table_schema='public' order by table_name;
```

- Empty result → fresh migration, full SQL needed
- Some tables → audit what exists vs what entity JSONCs describe
- All tables → confirm RLS, indexes, triggers also exist

### 0.3 — Are Edge Functions deployed?

```powershell
supabase functions list --project-ref <project-ref>
```

If empty, the `base44/functions/*` directory is reference code only — nothing is actually running.

### 0.4 — Does `base44Client.functions.invoke()` actually work or is it stubbed?

Search the file for `functions: { invoke:` — if the body is `console.log` or returns a fake `{ ok: true }`, the cloud function calls are no-ops. Your alerts/triggers/cron jobs aren't firing.

### 0.5 — File upload stub check

Search for `UploadFile`. If it returns `URL.createObjectURL(file)`, attachments are broken — blob URLs die on page reload.

### 0.6 — Inventory checklist (do this FIRST, before any coding)

| Item | Status check command | Expected for "ready" |
|---|---|---|
| DB schema | `select count(*) from information_schema.tables where table_schema='public'` | Number ≈ entity count |
| RLS enabled | `select tablename, rowsecurity from pg_tables where schemaname='public' and rowsecurity = false` | Empty result |
| GRANTs to anon/authenticated | `select grantee, table_name from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated') limit 5` | Has rows |
| Auth providers | Supabase Dashboard → Authentication → Providers | Whatever you want enabled is ON |
| Edge Functions | `supabase functions list` | All needed functions listed |
| Storage buckets | Supabase Dashboard → Storage | Buckets exist if needed |
| Email allow-list | Auth → URL Configuration | Site URL + Redirect URLs set |

---

## Phase 1 — Read the source of truth (1-2 hours)

### 🚨 GOTCHA #1: Never trust an AI summary of entity files

In KKGT we let an exploration agent describe the entities. The summary missed dozens of fields, mis-typed defaults, omitted enum values. **We spent days debugging schema mismatches that should never have happened.**

### Rule: Read every `base44/entities/*.jsonc` file directly, end-to-end.

These are the **authoritative schema** the Base44 frontend was built against. For each entity, extract:

1. **Field name** (exact spelling)
2. **Type** — `string`, `number`, `boolean`, `object`
3. **Format** — `date`, `date-time`, etc.
4. **Required** — only what's in the `required` array
5. **Default** — exact value
6. **Enum** — exact list of allowed values

Build a spreadsheet or markdown table per entity. Cross-check against the form code in `src/pages/*.jsx` — forms may send extra fields not in the JSONC.

### 1.1 — JSONC quirk: JSON-typed columns are strings

```json
"payment_history": {
  "type": "string",
  "description": "JSON array of payment entries..."
}
```

**That `type: "string"` is critical.** Base44 stores JSON as text strings. The frontend calls `JSON.parse(record.payment_history)` to read them. If you create the column as Postgres `jsonb`, the JS client returns parsed objects → `JSON.parse({...})` throws → "Unexpected token o in JSON at position 1" → silent error caught by try/catch → empty array displayed → user confusion.

**Use `text` for these columns.** Update triggers to cast via `::jsonb` when they need to parse.

### 1.2 — Required list is usually short

KKGT's PurchaseRecord required list:
```json
"required": ["supplier_name", "purchase_date"]
```

That's it. **2 fields**. We initially made 8+ fields `NOT NULL` because they "should" be required. Result: every form submission with a blank dispatch KG threw "null value violates not-null constraint". **Match Base44's required list exactly — nothing more.**

### 1.3 — Fields that look like FKs aren't always FKs

Base44 stores:
- `archived_by` as `string` (description: "Email of user who archived")
- `uploaded_by` as `string` (description: "User who uploaded")

These are **email strings or display names**, not UUIDs. If you create them as `uuid references auth.users(id)`, you'll need to drop the FK later when the frontend writes an email. We hit this and had to write a complex DO-block to drop FKs before changing types.

**Rule:** Default these to `text` unless the JSONC description explicitly says "ID of...".

---

## Phase 2 — Schema design (2-3 hours)

### Single migration file pattern

Write everything in one file: `supabase/migrations/YYYYMMDD_init.sql`. Idempotent up to `CREATE TABLE IF NOT EXISTS`, but **do not re-run on a populated DB without inspection**.

### 🚨 GOTCHA #2: Function ordering for `language sql`

```sql
-- WILL FAIL with "relation public.profiles does not exist"
create function public.is_admin()
returns boolean language sql stable as $$
  select role in ('admin','supervisor') from public.profiles where id = auth.uid();
$$;

-- profiles table created later in the same script
create table public.profiles (...);
```

**Why:** `language sql` parses the body at create time. The referenced table must already exist.

**Fix:** Move SQL-language functions to AFTER the tables they reference. Or use `language plpgsql` which defers parsing.

### 🚨 GOTCHA #3: Explicit GRANTs are required

`supabase db push` runs as the `postgres` user. Tables created this way **do not** inherit the auto-grants Supabase configures for `supabase_admin`. Result: every PostgREST request returns **403 Forbidden** — even with correct RLS policies.

```sql
-- ALWAYS include this at the top of every migration
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
```

**Plus at the bottom (covers tables created earlier in the same migration):**

```sql
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
```

### 🚨 GOTCHA #4: Generated columns reject all INSERT values

```sql
net_feresula numeric(14,3) generated always as (net_dispatch_weight_kg / 17) stored
```

If the frontend form sends `net_feresula: 1000`, Postgres rejects the **whole row** with:
`cannot insert into column "net_feresula"`.

**Fix in the client:** `supabaseClient.js` has a `TABLE_RULES` map that strips generated columns before INSERT. Add every generated column to the strip list.

### 🚨 GOTCHA #5: Every table needs `created_by`

Our `supabaseClient.js` auto-injects `created_by: user?.id` on every create. If a table doesn't have that column, the insert fails with `Could not find the 'created_by' column`.

**Rule:** Every table created in `public` needs `created_by uuid references auth.users(id)`. Including audit tables, lookup tables, settings tables.

### Standard column conventions

```sql
create table if not exists public.example (
  id uuid primary key default gen_random_uuid(),
  -- domain fields here, mostly NULLABLE unless in Base44 required list
  archived bool not null default false,
  archived_by text,                                -- TEXT, not uuid FK
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
```

### Standard triggers per table

```sql
-- updated_at maintenance
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists example_updated_at on public.example;
create trigger example_updated_at before update on public.example
  for each row execute function public.set_updated_at();
```

### Profile auto-creation trigger

```sql
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

### 🚨 GOTCHA #6: Triggers reading text-as-JSON columns

If `payment_history` is `text` containing JSON, triggers must cast to jsonb explicitly:

```sql
-- WRONG
select coalesce(sum((p->>'amount_etb')::numeric), 0)
from jsonb_array_elements(new.payment_history) p;   -- ERROR: text not jsonb

-- RIGHT
declare payments jsonb;
begin
  begin
    payments := coalesce(nullif(new.payment_history,'')::jsonb, '[]'::jsonb);
  exception when others then payments := '[]'::jsonb;
  end;
  select coalesce(sum((p->>'amount_etb')::numeric), 0) into x
  from jsonb_array_elements(payments) p;
end;
```

The `exception` block catches malformed JSON without aborting the transaction.

---

## Phase 3 — RLS policies (1 hour)

### Standard 4-policy pattern per business table

```sql
-- For every business table with a `created_by` column:
alter table public.X enable row level security;

drop policy if exists "X_select_auth" on public.X;
drop policy if exists "X_insert_auth" on public.X;
drop policy if exists "X_update_self_or_admin" on public.X;
drop policy if exists "X_delete_admin" on public.X;

create policy "X_select_auth" on public.X
  for select to authenticated using (true);
create policy "X_insert_auth" on public.X
  for insert to authenticated with check (true);
create policy "X_update_self_or_admin" on public.X
  for update to authenticated
  using (created_by = auth.uid() or public.is_admin());
create policy "X_delete_admin" on public.X
  for delete to authenticated using (public.is_admin());
```

Use a DO block + loop to apply the same pattern to many tables.

### Special cases

| Table type | Policy shape |
|---|---|
| Audit log (activity_logs, warehouse_receipt_history) | INSERT + SELECT for any auth; UPDATE/DELETE admin only |
| Per-user data (notifications, notification_settings) | Scoped by `recipient_email = (select email from profiles where id = auth.uid())` |
| Reference data (role_permissions, suppliers) | SELECT for any auth; INSERT/UPDATE/DELETE admin only |
| Profiles | self_read + admin_read + admin_write + self_update |

### 🚨 GOTCHA #7: RLS 403 ≠ row not found

Three different "no data" outcomes:

| HTTP status | Cause | Fix |
|---|---|---|
| 200 with `[]` | RLS policy denied + no row matches | Check policy `using` clause |
| 401 | JWT missing or invalid | Re-authenticate |
| **403** | **Missing GRANT** | **Run the GRANT statements from Phase 2** |
| 404 | Table not found | Check schema name |

If you see 403 on a SELECT, the role doesn't have the SQL grant — not the policy denying. Easy to confuse.

### 🚨 GOTCHA #8: Column type changes blocked by policies/FKs

```
ERROR: cannot alter type of a column used in a policy definition
ERROR: foreign key constraint cannot be implemented
```

Postgres won't change a column's type while a policy or FK references it. To migrate `archived_by uuid → text`:

```sql
-- 1. Drop the FK
do $$
declare fk_name text;
begin
  for fk_name in
    select conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.conrelid = 'public.X'::regclass
      and a.attname = 'archived_by'
  loop
    execute format('alter table public.X drop constraint %I', fk_name);
  end loop;
end $$;

-- 2. Drop dependent policies
drop policy if exists policy_using_archived_by on public.X;

-- 3. Change the type
alter table public.X alter column archived_by type text using archived_by::text;

-- 4. Recreate the policy without referencing archived_by (or adjust)
```

---

## Phase 4 — Auth setup (45 min)

### Google OAuth (the order matters)

Google's new "Google Auth Platform" UI requires this order:

1. **Branding** tab → fill app name + support email + Authorized domains (add `supabase.co`)
2. **Audience** tab → choose External + add yourself as a Test User
3. **Clients** tab → Create OAuth client → Web application
   - Authorized JavaScript origins: `http://localhost:5173` (+ prod URL later)
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Paste Client ID + Secret into Supabase Dashboard → Authentication → Providers → Google → Enable → **Save**

### 🚨 GOTCHA #9: "Unsupported provider: provider is not enabled"

Three things to verify when this error appears:

1. Google provider toggle is **ON** in Supabase dashboard AND you clicked **Save** at the bottom of the card
2. `.env.local` `VITE_SUPABASE_URL` matches the project where Google is enabled
3. Dev server was restarted after `.env.local` changed (Vite caches env at startup)

### Site URL + Redirect URLs

For each environment:
- **Site URL:** the bare origin (e.g. `https://app.com`)
- **Redirect URLs:** the origin + `/**` wildcard (e.g. `https://app.com/**`)

Keep `http://localhost:5173/**` for local dev. Don't replace, add.

### 🚨 GOTCHA #10: Test user "Advanced → Unsafe" warning

In Testing mode, Google shows "this app isn't verified". Listed test users can bypass via Advanced → Continue. Don't try to publish/verify the app for an internal tool — verification needs a privacy policy, logo, video walkthrough, ~weeks of paperwork. Testing mode works indefinitely for up to 100 users.

### First admin user

Sign in once with Google. The `handle_new_user` trigger creates a `profiles` row with `role='unassigned'`. Then in Supabase SQL Editor:

```sql
update public.profiles set role='admin' where lower(email)=lower('you@example.com');
```

Hard-reload the app (close tab + reopen). Don't just refresh — the auth context may keep the old role from cache.

---

## Phase 5 — Client (`supabaseClient.js`) (1 hour)

### Keep a compat alias for legacy imports

Many pages import `from '@/api/base44Client'`. Don't break those — leave a 1-line re-export:

```js
// src/api/base44Client.js
export { supabase, db, auth, functions, integrations, base44 } from './supabaseClient'
```

Migrate page imports to `@/api/supabaseClient` gradually.

### `cleanPayload` rules

```js
// src/api/supabaseClient.js
const TABLE_RULES = {
  purchase_records: {
    strip: ['net_feresula', 'total_paid_etb', 'balance_etb'],  // generated or trigger-managed
  },
  output_reports: { strip: ['export_kg', 'reject_kg'] },  // generated
  // ... etc
}

function cleanPayload(obj, tableName) {
  const rules = TABLE_RULES[tableName] || { strip: [] }
  const strip = new Set(['created_date', 'updated_date', ...rules.strip])
  const clean = {}
  for (const [key, value] of Object.entries(obj)) {
    if (strip.has(key)) continue
    clean[key] = value === '' ? null : value
  }
  return clean
}
```

### 🚨 GOTCHA #11: Don't auto-parse JSON for text columns

In our first cut, `cleanPayload` auto-parsed strings starting with `[` or `{` into objects. Worked great until we changed jsonb columns to text — then the parse made things worse. **Text columns want the string verbatim**.

If you keep jsonb columns somewhere, do the parse in the form code right before submit — not as a global rule.

### Self-healing retry on missing columns

```js
const UNKNOWN_COLUMN_RX = /Could not find the '([^']+)' column of '([^']+)' in the schema cache/i
async function withUnknownColumnRetry(tableName, payload, runner) {
  let attempt = { ...payload }
  for (let i = 0; i < 25; i++) {
    const { data, error } = await runner(attempt)
    if (!error) return { data, error: null }
    const match = error.message && error.message.match(UNKNOWN_COLUMN_RX)
    if (!match || !(match[1] in attempt)) return { data: null, error }
    console.warn(`[db.${tableName}] dropping unknown column "${match[1]}"`)
    const { [match[1]]: _omit, ...rest } = attempt
    attempt = rest
  }
  return { data: null, error: new Error('too many unknown columns') }
}
```

When a form sends a column the DB doesn't have, the client peels it off and retries instead of blocking the user. Console warning tells you which column needs to be added.

### 🚨 GOTCHA #12: `lint:fix` removes "unused" imports that still matter

The original frontend often had:
```js
import { supabase, base44 } from '@/api/base44Client'
```

If `supabase` is unused in a file, `eslint-plugin-unused-imports --fix` removes the whole import line — **including `base44`** that's referenced elsewhere in the file. We had to write a PowerShell script to add `import { base44 }` back to 38 files.

**Fix:** Before running `lint:fix`, ensure imports are line-separated:
```js
import { supabase } from '@/api/base44Client'
import { base44 } from '@/api/base44Client'
```

Then lint:fix only removes the truly unused one.

---

## Phase 6 — Edge Functions (30 min per function)

### Modern config.toml format

```toml
project_id = "<your-project-ref>"

[functions.send-telegram-message]
verify_jwt = true

# Add a [functions.<name>] block per function
[functions.notify-purchase-created]
verify_jwt = true
```

🚨 The old global `[functions]\nverify_jwt = true` is **rejected** by current Supabase CLI: "expected a map or struct, got bool".

### Project layout

```
supabase/functions/
  _shared/
    cors.ts         # Access-Control-Allow-* headers
    auth.ts         # JWT verification helper
  send-telegram-message/
    index.ts
  notify-X/
    index.ts
```

### Standard function shape

```ts
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    // ... logic ...
    return new Response(JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    // Swallow + return ok:false. NEVER throw — failures must not break business workflows.
    console.error('function error:', error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }),
      { status: 200, headers: corsHeaders });
  }
});
```

**Critical pattern:** swallow errors, return 200 with `ok: false`. Edge Function failures should never block frontend operations (e.g., Telegram outage shouldn't prevent a purchase save).

### Secrets before deploy

```powershell
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
supabase functions deploy send-telegram-message
```

Setting secrets after deploy works too — function picks them up on next invocation.

### Telegram bot setup checklist

1. BotFather → `/newbot` → get token
2. Create a group, **add the bot as ADMIN** (just member isn't enough)
3. Send any message in the group
4. Open `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Look for `"chat":{"id":-100xxxxxxxxxx}` — **the negative number including the minus sign** is your chat ID
6. Set the secrets, deploy the function, test with a purchase creation

---

## Phase 7 — Deployment to Vercel (20 min)

### Don't wait for CI

Vercel runs its own `npm install + build`, completely independent of GitHub Actions. If CI is red but `npm run build` works locally, Vercel will succeed.

### Required env vars in Vercel project

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | from .env.local |
| `VITE_SUPABASE_ANON_KEY` | from .env.local |

Apply to Production + Preview + Development.

### Post-deploy: update OAuth allow-lists

1. **Google Cloud Console** → OAuth client → Authorized JavaScript origins → add Vercel URL
2. **Supabase Authentication → URL Configuration:**
   - Site URL → Vercel URL
   - Redirect URLs → add Vercel URL + `/**` (keep localhost in the list too)

Test in **incognito** so no cached localhost session interferes.

---

## Phase 8 — Form-to-schema drift (ongoing)

The forms always evolve faster than the entity JSONCs. You'll hit "Could not find the 'X' column" errors. Process:

1. The self-healing client (Phase 5) logs `[db.X] dropping unknown column "Y"` warning
2. Note the column name from the console
3. Add it to the DB:
   ```sql
   alter table public.X add column if not exists Y <type>;
   ```
4. Add it to a future migration file so re-deploys don't regress
5. Optional: remove the strip if it's a real column

---

## Phase 9 — Data hygiene (auto-trim trigger pattern)

### 🚨 GOTCHA #13: Whitespace mismatches break aggregations

In KKGT, `supplier_name = "yohannes mulugeta "` (trailing space) on the master record and `"yohannes mulugeta"` (no space) on the purchase. Looked identical in UI. Made the availability calc return 0 KG. Hours wasted.

**Defense:** Install a trim trigger on every column used as a join key:

```sql
create or replace function public.trim_supplier_name()
returns trigger language plpgsql as $$
begin
  if new.supplier_name is not null then
    new.supplier_name := trim(new.supplier_name);
    if new.supplier_name = '' then new.supplier_name := null; end if;
  end if;
  return new;
end; $$;

-- Apply to every table that has supplier_name
do $$
declare tbl text;
begin
  for tbl in select unnest(array[
    'suppliers','purchase_records','warehouse_receipts','processing_logs',
    -- ... all tables with supplier_name
  ])
  loop
    execute format('drop trigger if exists trim_supplier_name_trg on public.%I', tbl);
    execute format(
      'create trigger trim_supplier_name_trg before insert or update of supplier_name ' ||
      'on public.%I for each row execute function public.trim_supplier_name()', tbl);
  end loop;
end $$;
```

And a one-shot UPDATE to normalize existing rows:

```sql
update public.X set supplier_name = trim(supplier_name)
where supplier_name <> trim(supplier_name);
```

---

## Phase 10 — Testing (1-2 hours setup, then ongoing)

### Playwright with service-role auth bypass

Bypass Google OAuth in tests by:

1. Use `supabase.auth.admin.createUser()` (service role) to create a test user with a password
2. Sign in with `signInWithPassword()` → get a real session JWT
3. Inject the session into localStorage before the test page loads

```js
const projectRef = new URL(SUPABASE_URL).host.split('.')[0];
await page.addInitScript(({ key, value }) => {
  window.localStorage.setItem(key, value);
}, { key: `sb-${projectRef}-auth-token`, value: JSON.stringify(session) });
```

Now `page.goto('/')` lands on the Dashboard, fully authenticated.

### The most valuable tests

Not UI clicks — **database triggers**. Test these explicitly:

- Insert a purchase, insert a warehouse receipt with lower KG, query the purchase, confirm `grand_total_etb` recomputed
- Insert a purchase with empty payment_history, update with a payment, confirm `total_paid_etb` and `balance_etb` updated

These are end-to-end proofs the business logic works. UI tests can be flaky; trigger tests are deterministic.

### Don't ship without tests for:

- Login (any role works)
- The triggers above
- A render check on every protected route (catches "X is not defined" regressions)

---

## Phase 11 — Operational checklist

### After v1 ships

| Item | When | How |
|---|---|---|
| Rotate Telegram bot token | Every 6 months | BotFather → /revoke → set new secret in Supabase |
| Rotate Supabase service role key | If ever exposed | Dashboard → Settings → API → reset |
| Backup test | Quarterly | Pick a date, restore to a staging project, query a row |
| RLS audit | Quarterly | `select tablename from pg_tables where schemaname='public' and rowsecurity=false` should be empty |
| `npm audit` | Monthly | Fix critical/high; defer moderate |
| Supabase pricing tier | When > 500 MB DB or 100 daily active users | Upgrade to Pro |

### The "Bus Factor One" trap

You are the only person who knows how this app works. Write a `docs/RUNBOOK.md` with:
- How to deploy
- How to add a user / change a role
- How to read Supabase logs
- Phone numbers for every paid service
- Who pays each bill
- The location of every secret (which Vercel project / Supabase project / GitHub repo)

If you got hit by a bus tomorrow, someone else should be able to keep the system running.

---

## Migration order summary (copy-paste this checklist)

```
[ ] Phase 0  — Diagnose what's actually missing (don't rebuild what's already there)
[ ] Phase 1  — Read every entity JSONC end-to-end (no AI summaries)
[ ] Phase 2  — Write the single init.sql migration
              [ ] GRANTs at top + bottom
              [ ] CREATE TABLEs in dependency order
              [ ] Helper functions AFTER referenced tables (sql language)
              [ ] Triggers
              [ ] RLS enable + policies
              [ ] Seed reference data
[ ] Phase 3  — RLS policies — standard 4-policy pattern + special cases
[ ] Phase 4  — Auth: Google OAuth → Branding → Audience → Clients → paste into Supabase
              [ ] First admin via SQL update
[ ] Phase 5  — supabaseClient.js
              [ ] cleanPayload with strip rules
              [ ] No auto-parse for text JSON columns
              [ ] Self-healing retry on unknown columns
              [ ] Compat alias for legacy `base44.*` imports
[ ] Phase 6  — Edge Functions
              [ ] [functions.<name>] config blocks
              [ ] Secrets before deploy
              [ ] Telegram bot must be GROUP ADMIN (not just member)
[ ] Phase 7  — Vercel deploy + update OAuth allow-lists
[ ] Phase 8  — Handle form-to-schema drift via console warnings
[ ] Phase 9  — Install trim triggers on join-key columns
[ ] Phase 10 — Playwright with service-role auth bypass
              [ ] Trigger tests (highest value)
              [ ] Render smoke test on every route
[ ] Phase 11 — Operational runbook + backup test
```

---

## Reference files in this repo

| File | What to copy for next migration |
|---|---|
| `supabase/migrations/20260527_init.sql` | Full schema template — table shape, RLS pattern, seed data |
| `supabase/migrations/20260527_010_align_with_legacy.sql` | All the fixes we applied after — read this to understand what to NOT do in v1 |
| `supabase/config.toml` | Modern `[functions.<name>]` syntax |
| `supabase/functions/send-telegram-message/index.ts` | Edge Function template — error-swallowing pattern |
| `src/api/supabaseClient.js` | TABLE_RULES + self-healing retry + cleanPayload |
| `src/api/base44Client.js` | Legacy compat alias (1 line) |
| `src/lib/AuthContext.jsx` | Auth context with role-assigned check |
| `src/components/ProtectedRoute.jsx` | Pending Approval routing pattern |
| `src/components/PendingApproval.jsx` | Pending Approval screen |
| `tests/fixtures/auth.js` | Service-role JWT injection pattern |
| `tests/e2e/01-auth.spec.js` | Basic auth test patterns |
| `tests/e2e/02-purchase-flow.spec.js` | Database trigger testing |
| `tests/e2e/03-page-renders.spec.js` | Route smoke test |
| `scripts/seed.js` | Realistic test data generation |
| `.github/workflows/ci.yml` | CI pipeline (lint + typecheck + build + deploy) |

---

## When the next Base44 update arrives — sync workflow

You're still developing in Base44. You'll get a new ZIP every so often. Here's how to bring those changes in without breaking the migrated version.

### Step 1 — Save the new ZIP somewhere distinct

```
D:\download\obedient-kkgt-coffee-flow (3).zip
```

### Step 2 — Don't overwrite the current code

Extract to a sibling folder, not on top:
```
D:\compare\base44-v3\
```

### Step 3 — Diff the entities first

```powershell
# Compare entity JSONCs — these are the schema source of truth
Compare-Object `
  (Get-ChildItem 'D:\coffee-flow\docs\legacy-base44-reference\base44\entities') `
  (Get-ChildItem 'D:\compare\base44-v3\base44\entities')
```

For each NEW or CHANGED entity:
1. Read the JSONC fully
2. Generate a new migration file `supabase/migrations/YYYYMMDD_phaseN.sql` with `ALTER TABLE ADD COLUMN IF NOT EXISTS ...`
3. Add any new tables with `CREATE TABLE IF NOT EXISTS ...` + full RLS + grants
4. Apply via `supabase db push`

### Step 4 — Diff the pages

```powershell
Compare-Object `
  (Get-ChildItem 'D:\coffee-flow\src\pages') `
  (Get-ChildItem 'D:\compare\base44-v3\src\pages')
```

New or changed pages:
- Copy the new file to `src/pages/`
- Replace any Base44-specific imports (`import.meta.env.VITE_BASE44_*`) with Supabase equivalents
- Ensure `import { base44 } from '@/api/supabaseClient'` is at the top if the file uses `base44.X`
- Add the route in `src/App.jsx`
- Add the sidebar entry in `src/components/layout/Sidebar.jsx`

### Step 5 — Run tests

```powershell
npm run test:e2e
```

If new pages break the render smoke test, fix before continuing.

### Step 6 — Commit + push (Vercel auto-deploys)

```powershell
git add .
git commit -m "Sync from Base44 v3 — new fields on PurchaseRecord, new page X"
git push
```

### What NEVER to port from Base44

- `package.json` `name`, `version`
- Anything that imports from `@base44/sdk`
- `VITE_BASE44_APP_ID` / `VITE_BASE44_APP_BASE_URL` references
- Base44 RLS config files (we use Postgres RLS)
- The `base44/functions/*` Deno files (we use `supabase/functions/*`)
- Base44 brand assets (use your own)
- `README.md` (yours is canonical)
- `.gitignore` (yours is canonical)

---

## Bug index — every error we hit, with the fix

| Symptom | Root cause | Fix |
|---|---|---|
| `relation "public.profiles" does not exist` during migration | `language sql` function references profiles before it's created | Move SQL functions to after CREATE TABLE profiles |
| `extension "pg_cron" not available` | Free tier doesn't have pg_cron | Remove the extension line; use Vercel cron + Edge Function HTTP invocation instead |
| `column "created_by" does not exist` in audit/log tables | Standard 4-policy loop assumed every table has created_by | Drop those tables from the loop, write custom policies |
| `failed to parse config: ...[functions[verify_jwt]] expected a map or struct, got "bool"` | Old config.toml syntax | Use `[functions.<name>]\nverify_jwt = X` per function |
| `Unsupported provider: provider is not enabled` (Google login) | Google toggle not saved in Supabase, or wrong project URL in .env.local | Verify toggle is ON + Save clicked; verify .env.local points to right project; restart dev server |
| `HTTP 403` on `/rest/v1/<table>?select=*` | No GRANT to authenticated role | Run the GRANT statements from Phase 2 |
| `null value in column "X" violates not-null constraint` | Schema made X NOT NULL but Base44 had it optional | `alter table Y alter column X drop not null` |
| `Could not find the 'X' column of 'Y' in the schema cache` | Frontend form sends a column the schema doesn't have | Self-healing retry handles it; add column properly with `alter table Y add column if not exists X <type>` |
| `cannot insert into column "X"` | X is a generated column | Add X to TABLE_RULES.<table>.strip |
| `cannot alter type of a column used in a policy definition` | Trying to ALTER TYPE while policy references the column | DROP POLICY → ALTER TYPE → recreate POLICY |
| `foreign key constraint cannot be implemented ... incompatible types: text and uuid` | Trying to ALTER TYPE while FK references the column | DROP CONSTRAINT (find it via pg_constraint) → ALTER TYPE → optionally recreate FK |
| Availability calc shows 0 KG but DB has 24,500 | Whitespace mismatch on join-key column (`"name "` vs `"name"`) | Trim trigger + one-shot UPDATE on existing rows |
| `base44 is not defined` after lint:fix | unused-imports rule stripped the whole import line | Re-add `import { base44 } from '@/api/supabaseClient'` per file; consider running a script to re-add to all files using `base44.X` |
| `checkUserAuth is not a function` warning in console | React Refresh kept stale Context provider | Hard reload (Ctrl+Shift+R) or close tab and reopen |
| Telegram message never arrives | Bot is in group but not as admin, OR chat ID missing the minus sign | Promote bot to admin; check chat ID is negative for groups |
| "App not verified" warning blocks login | Google OAuth client in Testing mode | Click Advanced → Continue. Don't try to publish — needs verification (weeks of paperwork) |
| `npx playwright test` says "No tests found" | Installed `playwright` instead of `@playwright/test` | `npm install --save-dev @playwright/test` then `npm run test:e2e` |
| Excel export shows codes like `B-023` as `-23.00` | SheetJS/auto-number coerced a text code to a number | Numeric-column detection must **reject any value containing a letter**; keep those columns as text |
| Report totals only summed one column | Hard-coded a single total column | `computeAutoTotals` sums **all** numeric, non-index, non-rate/price/% columns; write real `SUM()` formulas in Excel |
| Exported PDF still green/orange after rebrand | A page had its **own** local `exportPDF`/`exportXLSX` shadowing the shared engine | Delete page-local exporters; import the one shared engine everywhere |
| Excel file opens but has no colors/fills | Community **SheetJS ignores cell styles** | Use **exceljs** for styled output (real fills, fonts, formulas); SheetJS only for parsing imports |
| `<SelectItem value="">` crash (Radix) | Passed an empty-string value to a Select item | Filter out blank/empty options before mapping to `<SelectItem>` |
| Auto-mapper picked `#` or `COFFEE ERP` as a column header | Header-row guess hit a title/banner row; `"".includes("")` matches everything | Detect the **densest** row as the header; reject candidate headers shorter than 3 chars |
| Storage upload fails: `Bucket not found` | The storage bucket SQL was never run on that project | Run the `storage_vault` migration (creates the bucket + policies) on **every** environment |
| Storage upload fails: `new row violates row-level security policy` | `storage.objects` has RLS on by default but no policy for your bucket | Add `for insert/select/update` policies scoped to `bucket_id = '<bucket>'` |
| Private file link returns 400/expired | Used `getPublicUrl` on a **private** bucket, or the signed URL expired | Use `createSignedUrl(path, ttl)`; regenerate on each view |
| Demo mode: auth-redirect test fails | `VITE_DEMO_MODE=true` auto-logs in, so there's no redirect to `/login` | Expected — skip/guard that test when demo mode is on |

---

## Offline support (PWA + sync queue) — how it works & landmines

The app is a PWA with three offline layers:

1. **App shell** — `vite-plugin-pwa` (Workbox) precaches the build. App opens with no network.
2. **Offline reads** — React Query cache persisted to IndexedDB (`@tanstack/react-query-persist-client` + `idb-keyval`). Every `useQuery` serves last-seen data offline. `networkMode: 'offlineFirst'`, `gcTime: 24h`.
3. **Offline writes** — `src/lib/offlineQueue.js` (IndexedDB queue) + offline-aware `create`/`update` in `supabaseClient.js`. Offline writes return an optimistic record (`_pendingSync: true`, `temp_` id), inject into the list cache, and replay via `flushQueue()` on reconnect (auto-triggered by `usePendingSync`).

### 🚨 Offline landmines (all handled, know them anyway)

- **Role lost offline** → admins bounced to Pending Approval. Cause: AuthContext fetched the role via an uncached `supabase.from('profiles')` call. Fix: cache `{id, role}` in localStorage on success, fall back to it on offline failure. (`PROFILE_CACHE_KEY` in AuthContext.) Requires one online load first.
- **Server-side triggers don't run offline.** `grand_total_etb`, `balance_etb`, recalc-from-receipt run in Postgres. Offline drafts show *provisional* client-computed totals; the trigger recomputes authoritatively on sync. Label drafts `_pendingSync`.
- **`coffee_code` collisions.** Codes derive from `records.length + 1`. The optimistic record is injected into the cache so the next offline code increments correctly *on one device*. Two devices offline can still collide → on flush the `unique` constraint rejects the loser; `flushQueue` treats that as a *permanent* error and **drops** the item (doesn't block the queue). Real fix for heavy multi-device offline: server-assigned codes / UUID drafts (Phase 3).
- **Telegram can't fire offline.** `flushQueue` re-fires `notifyNewPurchase` after a purchase create syncs. Other entities' notifications are not re-fired — extend in `flushQueue` if needed.
- **Queue-blocking.** `flushQueue` stops on *network* errors (transient, retries later) but **drops** items on permanent errors (constraint/RLS) so one bad write can't wedge the queue forever.
- **Precache size.** The main bundle >2 MiB needs `workbox.maximumFileSizeToCacheInBytes` raised, else it won't precache. (Code-split later to shrink.)
- **Service worker caching the old app.** After deploying a fix, users may keep the old bundle until the SW updates. `registerType: 'autoUpdate'` handles most cases; for stubborn cases, uninstall/reinstall the PWA.

### Not yet built (Phase 3)

- Editing/deleting an *unsynced* draft (currently drafts are create-then-sync only)
- True multi-device conflict resolution (consider PowerSync rather than hand-rolling)
- Offline writes for every entity's list optimistic-injection (only the entities in `LIST_QUERY_KEY` get optimistic rows; others still queue + sync but won't show until refetch)

## Phase 12 — Branded report engine (PDF + Excel) — what actually works

The single biggest reporting lesson: **use the right library for each side, and route every export through ONE engine.**

### Library choices (decided after pain)

| Need | Use | Do NOT use |
|---|---|---|
| Styled Excel (fills, fonts, **real `SUM()` formulas**) | **`exceljs`** | community `xlsx`/SheetJS — *silently ignores all cell styles* |
| Parsing an uploaded Excel/CSV (import side) | `xlsx` (SheetJS) is fine here | exceljs (heavier than needed for reads) |
| PDF tables | **`jspdf` + `jspdf-autotable`** | hand-drawing rects with raw jsPDF |

### The "one engine" rule
Create **`src/lib/reportEngine.js`** exporting `exportReportPDF(...)`, `exportReportXLSX(...)`, and any specialized builders (e.g. `exportStatementPDF`). Every page imports these. **Never** let a page define its own `exportPDF`/`exportXLSX` — a local copy will shadow the shared one and your rebrand/fixes won't apply there (this is exactly why one report stayed green after the rebrand).

Keep thin wrappers (`exportUtils.js`) with the legacy signatures so old call sites don't all need rewriting:
```js
export const exportXLSX = (filename, title, headers, rows, totalsRow, dateRange) =>
  exportReportXLSX({ filename, title, subtitle: dateRange, headers, rows, totals: totalsRow, autoTotals: !!totalsRow });
```

### Number handling (the subtle bugs)
- **Detect numeric columns by content, and reject any value containing a letter.** Otherwise codes like `B-023`, `KKGT/24/001`, `GRN-12` get coerced to numbers (`-23.00`). One letter ⇒ treat the whole column as text.
- **Total every numeric column**, not just one — but **skip** index/`#`, and rate/price/percent/unit columns (summing a unit price is meaningless). Keep an `isNonSummableHeader()` allow-list.
- In Excel write **real formulas**, not pre-computed strings: `cell.value = { formula: 'SUM(F5:F29)', result: 1234 }`. The result is a fallback for viewers that don't recalc.
- Use `tabular-nums` and right-align numeric columns on screen *and* in the PDF.

### Branding band (logo + colored header)
- Rasterize your SVG logo to a small PNG (use `sharp`), base64-embed it in `src/lib/brandLogo.js` as `LOGO_PNG_DATAURL`. Embedding avoids a network fetch at export time and works offline.
- Put a colored header band (brand RGB) + logo + title + subtitle (date range / totals summary) at the top of every PDF and as a merged, filled header row in Excel. Alternating row fills (`ROW_ALT_RGB`) make long tables readable.
- **Sweep old brand names.** After a rebrand, grep the whole `src/` for the old company name — reports are the #1 place stale names hide (`grep -rin "KKGT\|oldname" src/`).

---

## Phase 13 — Document Vault (Supabase Storage) — the parts that bite

### Bucket + policies are SQL, and must run on every environment
Storage isn't created by your table migration. Add a dedicated migration:
```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments','attachments', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
```
- **Private bucket** (`public=false`) for business documents. Never `public=true` for contracts/payment slips.
- `storage.objects` already has **RLS on by default** — with no policy, *every* upload fails. Add policies scoped to `bucket_id`:
```sql
create policy "attachments_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments');
create policy "attachments_read"   on storage.objects for select to authenticated
  using (bucket_id = 'attachments');
create policy "attachments_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_admin());  -- restrict deletes
```
- **Run this on prod too.** "Bucket not found" in production almost always means you ran it only on dev.

### Viewing private files: signed URLs, not public URLs
Store the **storage path** (not a URL) in your metadata table. To view:
```js
const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 3600);
window.open(data.signedUrl);
```
`getPublicUrl` returns a 400 on a private bucket. Signed URLs expire — regenerate on each view, don't persist them.

### Path layout & validation
- Path = `${entityType}/${entityId}/${crypto.randomUUID()}.${ext}` — entity-scoped, collision-free, and lets you reason about ownership later.
- Validate size **and** MIME client-side before upload (`upsert:false`), and again via the bucket's `file_size_limit`/`allowed_mime_types`. HEIC and some browsers omit `file.type` — fall back to an extension check.
- Keep a metadata row (`attachments` table) with `file_url`/`storage_path`, `file_name`, `file_size`, `uploaded_by`, `uploaded_at`. The self-healing client may strip columns the table lacks — add `uploaded_at` explicitly if you want the date to survive a reload.

---

## Phase 14 — Mobile-friendly (this is a field app on phones over bad networks)

Real users here are on phones in warehouses. Treat mobile as the primary target, not an afterthought.

- **Test at 375px and 768px in DevTools** for every page. No horizontal scroll on the page body.
- **Tables:** wrap in `overflow-x-auto` with a sensible `min-w-[...]` so columns stay legible and the *table* scrolls, not the page. Negative margins (`-mx-4 sm:mx-0`) let tables go edge-to-edge on phones.
- **Nav:** an icon-rail + flyout/bottom-nav pattern works far better than a desktop sidebar on phones. Keep tap targets ≥ 40px.
- **Dialogs/sheets:** cap width (`max-w-...`) and make them full-height scrollable on mobile; don't trap content off-screen.
- **Inputs:** use proper `type`/`inputmode` (`inputmode="decimal"` for money/kg) so phones show the right keyboard.
- **Sticky headers** inside scroll containers need `position: sticky` on the right element, or they collapse.
- Use `tabular-nums` for all money/quantity so digits line up.
- Empty states and skeletons everywhere — a blank screen on a slow connection reads as "broken."

---

## Phase 15 — Dashboard charts (recharts)

- `recharts` + `<ResponsiveContainer width="100%" height={N}>` is the simplest path; give it a fixed pixel height (percentage heights collapse to 0).
- Define brand colors once as constants; reuse across charts for consistency.
- Pre-aggregate data in a `useMemo` (group by month/season/buyer) — don't compute inside the render.
- Conditional `<Cell>` colors (green ≥ 0, red < 0) make profit/loss instantly readable.
- Format axis ticks compactly (`(v)=>`${(v/1000).toFixed(0)}k``) and tooltips with full numbers.
- Charts are heavy — they pair well with route-level `React.lazy` so they don't bloat first paint.

---

## Phase 16 — Data Audit & Excel reconciliation (replacing "check it by hand in Excel")

Companies migrating off spreadsheets want proof the app matches their old Excel. Build a tool, don't ask them to eyeball it.

- **Consistency checks** (in-app): orphaned references, totals that don't equal their parts, negative balances, missing required links, duplicate codes. Surface as a pass/warn/fail list.
- **Excel reconciliation:** let them upload their sheet; match rows on a **composite key** (e.g. `coffee_code + supplier + date`), normalize dates and trim/upcase strings before comparing, and report rows only-in-app / only-in-Excel / value-mismatches.
- **Fuzzy column auto-mapping:** their headers won't match yours. Auto-map by normalized similarity, but let the user override via dropdowns. Detect the header row as the **densest** row (titles/banners fool naive "first row" logic).
- Make it admin-only and route-gated.

---

## Phase 17 — Demo mode (public, no-auth sandbox for selling)

To show the app to prospects without giving accounts:
- A single feature flag `VITE_DEMO_MODE=true` (keep it in `.env.local` and set it in Vercel for the demo deploy).
- When on, **auto-login** a fixed demo user (or bypass the auth gate) so visitors land straight in the app.
- **Know the side effect:** your "unauthenticated → redirect to /login" test will fail in demo mode because there's no redirect. Guard or skip that test when the flag is on (this is expected, not a regression).
- For a true public sandbox, consider seeding demo data and/or making writes ephemeral. At minimum, never point demo mode at the real production data project.

---

## Tech-stack cheat sheet (what this app standardized on)

| Concern | Choice | Note |
|---|---|---|
| Build | Vite 6 + React 18 + React Router 6 | |
| Server state | TanStack Query 5 | persisted to IndexedDB for offline reads |
| UI | Tailwind + shadcn/Radix | |
| DB/Auth/Functions/Storage | Supabase (Postgres, Auth, Edge/Deno, Storage) | RLS is the real security boundary |
| Hosting | Vercel (frontend) + Supabase (backend) | deploy from `main` |
| Excel (write) | **exceljs** | styles + formulas |
| Excel (read/import) | **xlsx** (SheetJS) | parsing only |
| PDF | **jspdf** + **jspdf-autotable** | |
| Charts | **recharts** | |
| PWA/offline | vite-plugin-pwa + idb-keyval + custom queue | |
| Icons | lucide-react | no emoji in UI |
| Validation | zod | on high-stakes forms |
| Image → icon PNG | sharp | rasterize SVG logo once |

**Dead deps to delete on sight** (Base44 ships them, you won't use them): `@stripe/*`, `three`, `react-leaflet`, `react-quill`, `embla-carousel-react`, `canvas-confetti`, `react-markdown`, `moment` (date-fns covers it), `next-themes`. Verify 0 references first, then remove — smaller bundle = faster first paint on slow connections.

---

## Final wisdom

1. **Read JSONCs first.** Every schema bug we hit traces back to skipping this step.
2. **Migrations are atomic.** A single bad statement rolls back the whole file. Test in small batches when possible.
3. **PostgREST 403 = grant problem**, almost never an RLS problem. RLS denials return 200 with `[]`.
4. **The frontend can write columns the schema doesn't have** — the self-healing client makes this non-fatal but you should still add them properly.
5. **Triggers are the highest-value tests.** UI tests are flaky and break when designs change. Trigger tests prove the business logic and rarely need updates.
6. **Auto-trim text columns used as join keys.** Whitespace bugs are silent and waste days.
7. **One report engine, never page-local exporters.** A shadow copy is why a report kept the old colors after a full rebrand.
8. **exceljs to write, SheetJS to read.** SheetJS silently drops styles; never debug "why are my Excel colors missing" again.
9. **Storage = its own SQL on every environment.** Bucket + `storage.objects` policies aren't in your table migration, and "Bucket not found" in prod means you forgot to run it there.
10. **Private files use signed URLs, never public URLs.** And the path lives in the DB, not the URL.
11. **Mobile is the primary target.** Field users are on phones over bad networks — 375px, scrollable tables, skeletons, offline.
12. **Reject letter-containing values from numeric columns.** Otherwise codes (`B-023`) become numbers (`-23`).
13. **Document everything.** This file is your defense against repeating the same migration mistakes.

—

End of runbook. Update this file every time you discover a new gotcha so the next migration is faster than this one.
