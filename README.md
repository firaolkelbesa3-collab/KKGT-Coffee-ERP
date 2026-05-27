# KKGT Coffee Flow

ERP for KKGT coffee export operations — supplier purchase, warehouse, processing, output, buyer inspection, and export contracts with payment tracking, supplier bag ledger, role-based access, and Telegram alerts.

## Stack

- **Frontend:** React 18 + Vite 6 + React Router 6 + TanStack Query 5 + Tailwind + shadcn/Radix
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage)
- **Hosting:** Vercel (SPA, `vercel.json` rewrites everything to `index.html`)
- **Auth:** Google OAuth via Supabase Auth (no public registration)

## Local setup

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

## Project layout

```
src/
  api/supabaseClient.js     Supabase client + entity-CRUD shim (db.PurchaseRecord etc.)
  pages/                    21 pages, one per route
  components/
    layout/                 AppLayout, Sidebar
    ui/                     shadcn/Radix primitives
    {purchases,warehouse,exports,bagledger,processing,...}/  module-specific
  lib/                      AuthContext, useRole, notificationService, exporters, validators
  hooks/                    React Query helpers
supabase/
  config.toml               local-dev + project config
  migrations/               SQL migrations applied by `supabase db push`
  functions/                Deno Edge Functions (send-telegram, notify-*, etc.)
docs/
  legacy-base44-reference/  historical Base44 entity schemas and function code
```

## Deploy

- **DB schema:** `supabase db push` (uses `supabase/migrations/`)
- **Edge Functions:** `supabase functions deploy <name>`
- **Frontend:** push to `main`; Vercel deploys automatically (preview deploys per PR)

## Required env vars

Client (`.env.local`, also set in Vercel project):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Supabase Edge Functions (set via `supabase secrets set`):

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Supabase Auth (Dashboard → Authentication → Providers → Google):

- Google OAuth client ID and secret

## Roles

`admin`, `supervisor`, `purchaser`, `warehouse_keeper`, `process_manager`, `final_registrar`, `export_manager`.

New Google users land with `role='unassigned'` and see the **Pending Approval** screen until an admin assigns a role on `/permissions`.

## v1.1 backlog

File attachments (Supabase Storage), daily/weekly/monthly XLSX backups, WarehouseReceiptHistory DB trigger, Telegram weekly summary cron, email notifications, Sentry, Playwright E2E, MFA for admin, multi-tenant support.
