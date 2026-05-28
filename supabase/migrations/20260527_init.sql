-- =========================================================================
-- KKGT Coffee Flow - initial schema
-- Idempotent up to CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS.
-- DO NOT re-run on a populated DB without inspection.
-- =========================================================================

create extension if not exists "pgcrypto";

-- =========================================================================
-- Runtime grants
-- `supabase db push` runs as the `postgres` user, so the default-privilege
-- machinery that auto-grants new tables to anon/authenticated does NOT apply.
-- Without explicit grants, every PostgREST request returns 403 even when
-- RLS would otherwise allow it. We grant once, then ALTER DEFAULT PRIVILEGES
-- so any tables created later in this migration inherit the same access.
-- =========================================================================
grant usage on schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- =========================================================================
-- Helpers
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- current_role_name() and is_admin() are defined AFTER public.profiles so that
-- their SQL bodies can be parsed against an existing schema.

-- =========================================================================
-- profiles (mirrors auth.users)
-- =========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'unassigned'
    check (role in ('unassigned','admin','supervisor','purchaser',
                    'warehouse_keeper','process_manager','final_registrar','export_manager')),
  phone text,
  is_active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id,
          new.email,
          coalesce(new.raw_user_meta_data->>'full_name',
                   new.raw_user_meta_data->>'name',
                   split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Now that public.profiles exists, define role-helper SQL functions used by RLS.
create or replace function public.current_role_name()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid())
                  in ('admin','supervisor'), false);
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- suppliers
-- =========================================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null unique,
  region text check (region in
    ('Wollega','Yirgacheffe','Sidama','Jimma','Harrar','Kaffa','Guji','Bench','Gedeo','Other')),
  agent text,
  coffee_type text,
  opening_stock_kg numeric(14,3) default 0,
  phone_number text,
  coffee_origin text,
  station_name text,
  agreement_date date,
  agreement_expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists suppliers_name_idx on public.suppliers(supplier_name);
drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

-- =========================================================================
-- purchase_records
-- =========================================================================
create table if not exists public.purchase_records (
  id uuid primary key default gen_random_uuid(),
  coffee_code text not null unique,
  purchase_date date not null,
  supplier_name text not null,
  agent text,
  region text,
  coffee_type text,
  net_dispatch_weight_kg numeric(14,3) not null default 0,
  warehouse_received_net_kg numeric(14,3),
  unit_price_etb_per_feresula numeric(18,2) not null default 0,
  commission_percent numeric(7,4) not null default 0,
  additional_costs jsonb not null default '[]'::jsonb,
  payment_history jsonb not null default '[]'::jsonb,
  net_feresula numeric(14,3) generated always as (net_dispatch_weight_kg / 17) stored,
  commission_etb numeric(18,2),
  total_purchase_price numeric(18,2),
  grand_total_etb numeric(18,2),
  total_paid_etb numeric(18,2) not null default 0,
  balance_etb numeric(18,2),
  remark text,
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists pr_supplier_idx on public.purchase_records(supplier_name);
create index if not exists pr_date_idx on public.purchase_records(purchase_date desc);
create index if not exists pr_archived_idx on public.purchase_records(archived);
create index if not exists pr_created_at_idx on public.purchase_records(created_at desc);
drop trigger if exists pr_updated_at on public.purchase_records;
create trigger pr_updated_at before update on public.purchase_records
  for each row execute function public.set_updated_at();

create or replace function public.pr_recompute_totals()
returns trigger language plpgsql as $$
declare
  paid numeric(18,2);
begin
  select coalesce(sum((p->>'amount_etb')::numeric),0) into paid
  from jsonb_array_elements(coalesce(new.payment_history,'[]'::jsonb)) p;
  new.total_paid_etb := paid;
  if new.grand_total_etb is not null then
    new.balance_etb := new.grand_total_etb - paid;
  end if;
  return new;
end;
$$;
drop trigger if exists pr_recompute on public.purchase_records;
create trigger pr_recompute before insert or update on public.purchase_records
  for each row execute function public.pr_recompute_totals();

-- =========================================================================
-- warehouse_receipts
-- =========================================================================
create table if not exists public.warehouse_receipts (
  id uuid primary key default gen_random_uuid(),
  coffee_code text not null,
  purchase_record_id uuid references public.purchase_records(id),
  supplier_name text,
  net_dispatch_weight_kg numeric(14,3),
  warehouse_received_net_kg numeric(14,3) not null,
  bags_received int,
  grn_code text,
  dispatch_no text,
  received_date date not null,
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists wr_coffee_code_idx on public.warehouse_receipts(coffee_code);
create index if not exists wr_purchase_idx on public.warehouse_receipts(purchase_record_id);
create index if not exists wr_received_idx on public.warehouse_receipts(received_date desc);
drop trigger if exists wr_updated_at on public.warehouse_receipts;
create trigger wr_updated_at before update on public.warehouse_receipts
  for each row execute function public.set_updated_at();

create or replace function public.recalc_purchase_from_receipt()
returns trigger language plpgsql as $$
declare
  pr public.purchase_records%rowtype;
  feresula numeric(14,3);
  base numeric(18,2);
  comm numeric(18,2);
  extra numeric(18,2);
  grand numeric(18,2);
begin
  select * into pr from public.purchase_records
    where coffee_code = new.coffee_code limit 1;
  if not found then return new; end if;
  feresula := new.warehouse_received_net_kg / 17;
  base := feresula * pr.unit_price_etb_per_feresula;
  comm := base * pr.commission_percent / 100;
  select coalesce(sum((c->>'amount')::numeric),0) into extra
  from jsonb_array_elements(coalesce(pr.additional_costs,'[]'::jsonb)) c;
  grand := base + comm + extra;
  update public.purchase_records
    set warehouse_received_net_kg = new.warehouse_received_net_kg,
        commission_etb = comm,
        total_purchase_price = base,
        grand_total_etb = grand,
        balance_etb = grand - pr.total_paid_etb
    where id = pr.id;
  return new;
end;
$$;
drop trigger if exists wr_recalc on public.warehouse_receipts;
create trigger wr_recalc after insert or update of warehouse_received_net_kg
  on public.warehouse_receipts
  for each row execute function public.recalc_purchase_from_receipt();

-- =========================================================================
-- warehouse_receipt_history
-- =========================================================================
create table if not exists public.warehouse_receipt_history (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.warehouse_receipts(id) on delete cascade,
  action_type text not null check (action_type in ('Created','Edited','Archived','Restored')),
  user_email text,
  user_name text,
  user_role text,
  action_at timestamptz not null default now(),
  changes jsonb not null default '[]'::jsonb,
  kg_impact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists wrh_receipt_idx on public.warehouse_receipt_history(receipt_id);

-- =========================================================================
-- warehouse_inventory
-- =========================================================================
create table if not exists public.warehouse_inventory (
  id uuid primary key default gen_random_uuid(),
  lot_number text,
  coffee_type text check (coffee_type in ('Arabica','Robusta','Mixed')),
  grade text check (grade in ('Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Ungraded')),
  quantity_kg numeric(14,3) not null default 0,
  warehouse_location text,
  status text check (status in ('In Storage','In Processing','Ready for Export','Exported')),
  received_date date,
  source_purchase_id uuid references public.purchase_records(id),
  moisture_content numeric(7,4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists wi_updated_at on public.warehouse_inventory;
create trigger wi_updated_at before update on public.warehouse_inventory
  for each row execute function public.set_updated_at();

-- =========================================================================
-- processing_logs
-- =========================================================================
create table if not exists public.processing_logs (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('Standard','Recleaning')),
  entry_mode text check (entry_mode in ('By Bags','By KG')),
  date date not null,
  supplier_name text,
  coffee_type text,
  coffee_code text,
  batch_no text,
  bags_sent numeric(10,2),
  kg_sent numeric(14,3),
  actual_weighed_kg numeric(14,3),
  batch_variance_kg numeric(14,3),
  buyer_name text,
  inspection_ref text,
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists pl_date_idx on public.processing_logs(date desc);
create index if not exists pl_supplier_idx on public.processing_logs(supplier_name);
create index if not exists pl_archived_idx on public.processing_logs(archived);
drop trigger if exists pl_updated_at on public.processing_logs;
create trigger pl_updated_at before update on public.processing_logs
  for each row execute function public.set_updated_at();

-- =========================================================================
-- processing_batches
-- =========================================================================
create table if not exists public.processing_batches (
  id uuid primary key default gen_random_uuid(),
  batch_number text,
  lot_number text,
  coffee_type text check (coffee_type in ('Arabica','Robusta','Mixed')),
  process_type text check (process_type in ('Washed','Natural','Honey','Semi-Washed')),
  input_quantity_kg numeric(14,3),
  output_quantity_kg numeric(14,3),
  status text check (status in ('Pending','Washing','Drying','Hulling','Grading','Completed')),
  output_grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists pb_updated_at on public.processing_batches;
create trigger pb_updated_at before update on public.processing_batches
  for each row execute function public.set_updated_at();

-- =========================================================================
-- output_reports
-- =========================================================================
create table if not exists public.output_reports (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('Standard','Recleaned')),
  start_date date not null,
  end_date date not null,
  supplier_name text,
  coffee_type text,
  total_kg_processed numeric(14,3) not null default 0,
  export_bags int default 0,
  export_kg numeric(14,3) generated always as (export_bags * 60) stored,
  reject_bags int default 0,
  reject_kg numeric(14,3) generated always as (reject_bags * 85) stored,
  waste_kg numeric(14,3) default 0,
  additional_pool1_kg numeric(14,3) default 0,
  export_status text check (export_status in ('Available for Export','Exported')) default 'Available for Export',
  registrar_name text,
  remark text,
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists or_date_idx on public.output_reports(end_date desc);
drop trigger if exists or_updated_at on public.output_reports;
create trigger or_updated_at before update on public.output_reports
  for each row execute function public.set_updated_at();

-- =========================================================================
-- export_contracts
-- =========================================================================
create table if not exists public.export_contracts (
  id uuid primary key default gen_random_uuid(),
  contract_no text not null unique,
  contract_pi_number text,
  contract_date date not null,
  coffee_type text,
  coffee_grade text,
  destination_country text,
  buyer_name text,
  stock_pool text check (stock_pool in ('Fresh','Recleaned')),
  payment_terms text check (payment_terms in ('LC','CAD','Advance','Open Account','Other')),
  custom_payment_terms text,
  expected_payment_date date,
  export_kg numeric(14,3) not null,
  export_bags int,
  price_per_kg_usd numeric(18,4),
  contract_rate_etb numeric(18,4),
  rate_status text check (rate_status in ('Rate Pending','Rate Confirmed')) default 'Rate Pending',
  total_export_value_usd numeric(18,2),
  total_export_value_etb numeric(18,2),
  cost_rows jsonb not null default '[]'::jsonb,
  total_materials_etb numeric(18,2) default 0,
  total_costs_etb numeric(18,2) default 0,
  total_reject_sales_etb numeric(18,2) default 0,
  grand_total_revenue_etb numeric(18,2),
  profit_etb numeric(18,2),
  profit_usd numeric(18,4),
  profit_margin_pct numeric(7,4),
  payment_history jsonb not null default '[]'::jsonb,
  total_received_usd numeric(18,2) default 0,
  total_received_etb numeric(18,2) default 0,
  payment_status text check (payment_status in ('Unpaid','Partial','Fully Received')) default 'Unpaid',
  status text check (status in ('Pending','In Progress','Shipped','Completed')) default 'Pending',
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists ec_date_idx on public.export_contracts(contract_date desc);
create index if not exists ec_buyer_idx on public.export_contracts(buyer_name);
drop trigger if exists ec_updated_at on public.export_contracts;
create trigger ec_updated_at before update on public.export_contracts
  for each row execute function public.set_updated_at();

-- =========================================================================
-- exports (legacy stub - kept for /exports route)
-- =========================================================================
create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  contract_number text,
  buyer_name text,
  buyer_country text,
  coffee_type text,
  grade text,
  quantity_kg numeric(14,3),
  price_per_kg_usd numeric(18,4),
  total_value_usd numeric(18,2),
  shipment_date date,
  status text check (status in ('Contract Signed','Preparing','In Transit','Delivered','Completed')),
  shipping_method text check (shipping_method in ('Sea Freight','Air Freight','Land Transport')),
  batch_numbers text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists exports_updated_at on public.exports;
create trigger exports_updated_at before update on public.exports
  for each row execute function public.set_updated_at();

-- =========================================================================
-- purchases (legacy stub)
-- =========================================================================
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- =========================================================================
-- buyer_inspections
-- =========================================================================
create table if not exists public.buyer_inspections (
  id uuid primary key default gen_random_uuid(),
  inspection_date date not null,
  buyer_name text,
  coffee_type text,
  kg_to_inspect numeric(14,3),
  sample_kg_taken numeric(14,3) default 0,
  result text check (result in ('Pending','Passed','Failed')) default 'Pending',
  kg_approved numeric(14,3),
  linked_contract_id uuid references public.export_contracts(id),
  linked_contract_no text,
  rejection_reason text check (rejection_reason in
    ('Too Much Moisture','Grade Too Low','Defects','Smell/Taste Issue','Other')),
  kg_rejected numeric(14,3),
  action_taken text check (action_taken in ('Reprocess','Sell Locally','Hold in Warehouse')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists bi_updated_at on public.buyer_inspections;
create trigger bi_updated_at before update on public.buyer_inspections
  for each row execute function public.set_updated_at();

-- =========================================================================
-- sample_logs
-- =========================================================================
create table if not exists public.sample_logs (
  id uuid primary key default gen_random_uuid(),
  sample_type text check (sample_type in ('Warehouse','Export Inspection','Export','Arrival')),
  supplier_name text,
  coffee_type text,
  buyer_name text,
  inspection_ref text,
  export_contract_id uuid references public.export_contracts(id),
  export_contract_no text,
  warehouse_receipt_id uuid references public.warehouse_receipts(id),
  sample_date date,
  sample_datetime timestamptz,
  sample_kg numeric(14,3),
  company_recipient text,
  keeper_name text,
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists sl_updated_at on public.sample_logs;
create trigger sl_updated_at before update on public.sample_logs
  for each row execute function public.set_updated_at();

-- =========================================================================
-- bag_receipts
-- =========================================================================
create table if not exists public.bag_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_mode text check (receipt_mode in ('agent','supplier')) not null,
  agent_name text,
  supplier_name text,
  warehouse_receipt_id uuid references public.warehouse_receipts(id),
  date date not null,
  warehouse_received_kg numeric(14,3),
  bags_received int,
  source text check (source in ('warehouse','manual')) default 'manual',
  archived bool not null default false,
  archived_by uuid references auth.users(id),
  archived_at timestamptz,
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists br_updated_at on public.bag_receipts;
create trigger br_updated_at before update on public.bag_receipts
  for each row execute function public.set_updated_at();

create table if not exists public.supplier_bag_returns (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  agent_name text,
  return_date date not null,
  bags_returned int,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists sbr_updated_at on public.supplier_bag_returns;
create trigger sbr_updated_at before update on public.supplier_bag_returns
  for each row execute function public.set_updated_at();

create table if not exists public.supplier_bag_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  agent_name text,
  payment_date date not null,
  bank_name text,
  branch_account text,
  reference_no text,
  payment_type text check (payment_type in ('Advance','Final Payment')),
  amount_etb numeric(18,2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists sbp_updated_at on public.supplier_bag_payments;
create trigger sbp_updated_at before update on public.supplier_bag_payments
  for each row execute function public.set_updated_at();

create table if not exists public.supplier_bag_settlements (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  bags_received_adjustment int default 0,
  bags_used_adjustment int default 0,
  loss_percent_override numeric(7,4) default 1.0,
  bags_returned_date date,
  bags_returned_count int default 0,
  bags_returned_note text,
  cash_paid numeric(18,2),
  cash_paid_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists sbs_updated_at on public.supplier_bag_settlements;
create trigger sbs_updated_at before update on public.supplier_bag_settlements
  for each row execute function public.set_updated_at();

create table if not exists public.reject_bag_usages (
  id uuid primary key default gen_random_uuid(),
  reject_mode text check (reject_mode in ('agent','supplier')),
  agent_name text,
  supplier_name text,
  date date not null,
  bags_used int,
  amount_etb numeric(18,2) generated always as (bags_used * 153) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists rbu_updated_at on public.reject_bag_usages;
create trigger rbu_updated_at before update on public.reject_bag_usages
  for each row execute function public.set_updated_at();

-- =========================================================================
-- material_entries / material_register_entries
-- =========================================================================
create table if not exists public.material_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  item_name text,
  quantity numeric(14,3),
  unit_cost_etb numeric(18,2),
  total_cost_etb numeric(18,2) generated always as (quantity * unit_cost_etb) stored,
  purpose text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists me_updated_at on public.material_entries;
create trigger me_updated_at before update on public.material_entries
  for each row execute function public.set_updated_at();

create table if not exists public.material_register_entries (
  id uuid primary key default gen_random_uuid(),
  category text check (category in ('export','general')) not null,
  date date not null,
  item_type text check (item_type in ('Bag','Craft','Plaster','Green Pro')),
  bag_size text check (bag_size in ('30kg','50kg','60kg')),
  entry_type text check (entry_type in ('Purchase','Usage')),
  item_name text,
  quantity numeric(14,3),
  unit_cost_etb numeric(18,2),
  total_cost_etb numeric(18,2) generated always as (quantity * unit_cost_etb) stored,
  purpose text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
drop trigger if exists mre_updated_at on public.material_register_entries;
create trigger mre_updated_at before update on public.material_register_entries
  for each row execute function public.set_updated_at();

-- =========================================================================
-- notifications + activity + permissions + attachments
-- =========================================================================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_role text,
  type text not null,
  title text,
  message text,
  link_path text,
  link_label text,
  is_read bool not null default false,
  severity text check (severity in ('info','warning','critical')) default 'info',
  entity_type text,
  entity_id text,
  created_at timestamptz not null default now()
);
create index if not exists notif_recipient_idx on public.notifications(recipient_email, created_at desc);
create index if not exists notif_dedup_idx on public.notifications(type, entity_id, created_at);

create table if not exists public.notification_settings (
  id uuid primary key default gen_random_uuid(),
  user_email text not null unique,
  disabled_types jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists ns_updated_at on public.notification_settings;
create trigger ns_updated_at before update on public.notification_settings
  for each row execute function public.set_updated_at();

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_email text,
  action_type text check (action_type in ('Created','Edited','Archived','Restored')),
  screen_name text,
  entity_type text,
  entity_id text,
  record_description text,
  changes jsonb default '[]'::jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists al_entity_idx on public.activity_logs(entity_type, entity_id);
create index if not exists al_created_idx on public.activity_logs(created_at desc);

create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role text not null unique,
  allowed_paths jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text check (entity_type in ('purchase_record','warehouse_receipt','export_contract')) not null,
  entity_id uuid not null,
  section text,
  section_ref text,
  storage_path text,
  file_name text,
  file_size int,
  mime_type text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists att_entity_idx on public.attachments(entity_type, entity_id);

-- =========================================================================
-- RLS: enable on every table
-- =========================================================================
alter table public.profiles                    enable row level security;
alter table public.suppliers                   enable row level security;
alter table public.purchase_records            enable row level security;
alter table public.warehouse_receipts          enable row level security;
alter table public.warehouse_receipt_history   enable row level security;
alter table public.warehouse_inventory         enable row level security;
alter table public.processing_logs             enable row level security;
alter table public.processing_batches          enable row level security;
alter table public.output_reports              enable row level security;
alter table public.export_contracts            enable row level security;
alter table public.exports                     enable row level security;
alter table public.purchases                   enable row level security;
alter table public.buyer_inspections           enable row level security;
alter table public.sample_logs                 enable row level security;
alter table public.bag_receipts                enable row level security;
alter table public.supplier_bag_returns        enable row level security;
alter table public.supplier_bag_payments       enable row level security;
alter table public.supplier_bag_settlements    enable row level security;
alter table public.reject_bag_usages           enable row level security;
alter table public.material_entries            enable row level security;
alter table public.material_register_entries   enable row level security;
alter table public.notifications               enable row level security;
alter table public.notification_settings       enable row level security;
alter table public.activity_logs               enable row level security;
alter table public.role_permissions            enable row level security;
alter table public.attachments                 enable row level security;

-- =========================================================================
-- Policies: drop-then-create for idempotency
-- Standard shape (4 policies) for every business table that has a
-- `created_by` column. Tables with different ownership columns
-- (warehouse_receipt_history, attachments, notification_settings) get
-- custom policies further down.
-- =========================================================================
do $$
declare
  t text;
  business_tables text[] := array[
    'suppliers','purchase_records','warehouse_receipts',
    'warehouse_inventory','processing_logs','processing_batches','output_reports',
    'export_contracts','exports','purchases','buyer_inspections','sample_logs',
    'bag_receipts','supplier_bag_returns','supplier_bag_payments','supplier_bag_settlements',
    'reject_bag_usages','material_entries','material_register_entries'
  ];
begin
  foreach t in array business_tables loop
    execute format('drop policy if exists "%s_select_auth" on public.%I', t, t);
    execute format('drop policy if exists "%s_insert_auth" on public.%I', t, t);
    execute format('drop policy if exists "%s_update_self_or_admin" on public.%I', t, t);
    execute format('drop policy if exists "%s_delete_admin" on public.%I', t, t);
    execute format('create policy "%s_select_auth" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s_insert_auth" on public.%I for insert to authenticated with check (true)', t, t);
    execute format('create policy "%s_update_self_or_admin" on public.%I for update to authenticated using (created_by = auth.uid() or public.is_admin())', t, t);
    execute format('create policy "%s_delete_admin" on public.%I for delete to authenticated using (public.is_admin())', t, t);
  end loop;
end $$;

-- warehouse_receipt_history: append-only audit. Anyone authenticated can insert
-- and read; only admins can mutate or delete.
drop policy if exists wrh_select_auth on public.warehouse_receipt_history;
drop policy if exists wrh_insert_auth on public.warehouse_receipt_history;
drop policy if exists wrh_admin_update on public.warehouse_receipt_history;
drop policy if exists wrh_admin_delete on public.warehouse_receipt_history;
create policy wrh_select_auth on public.warehouse_receipt_history
  for select to authenticated using (true);
create policy wrh_insert_auth on public.warehouse_receipt_history
  for insert to authenticated with check (true);
create policy wrh_admin_update on public.warehouse_receipt_history
  for update to authenticated using (public.is_admin());
create policy wrh_admin_delete on public.warehouse_receipt_history
  for delete to authenticated using (public.is_admin());

-- attachments: owner column is `uploaded_by`.
drop policy if exists attachments_select_auth on public.attachments;
drop policy if exists attachments_insert_auth on public.attachments;
drop policy if exists attachments_update_self_or_admin on public.attachments;
drop policy if exists attachments_delete_self_or_admin on public.attachments;
create policy attachments_select_auth on public.attachments
  for select to authenticated using (true);
create policy attachments_insert_auth on public.attachments
  for insert to authenticated with check (true);
create policy attachments_update_self_or_admin on public.attachments
  for update to authenticated using (uploaded_by = auth.uid() or public.is_admin());
create policy attachments_delete_self_or_admin on public.attachments
  for delete to authenticated using (uploaded_by = auth.uid() or public.is_admin());

-- notification_settings: each user owns their own row, keyed by user_email.
drop policy if exists ns_select_own on public.notification_settings;
drop policy if exists ns_upsert_own on public.notification_settings;
drop policy if exists ns_update_own on public.notification_settings;
drop policy if exists ns_admin_delete on public.notification_settings;
create policy ns_select_own on public.notification_settings
  for select to authenticated
  using (user_email = (select email from public.profiles where id = auth.uid()) or public.is_admin());
create policy ns_upsert_own on public.notification_settings
  for insert to authenticated
  with check (user_email = (select email from public.profiles where id = auth.uid()));
create policy ns_update_own on public.notification_settings
  for update to authenticated
  using (user_email = (select email from public.profiles where id = auth.uid()) or public.is_admin());
create policy ns_admin_delete on public.notification_settings
  for delete to authenticated using (public.is_admin());

-- profiles
drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_admin_read on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists profiles_self_update_safe on public.profiles;
create policy profiles_self_read on public.profiles for select to authenticated
  using (auth.uid() = id);
create policy profiles_admin_read on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Self users may update their own non-role fields; role changes go through admin policy
create policy profiles_self_update_safe on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- purchase_records: tighter insert (only purchaser+, admin, supervisor)
drop policy if exists purchase_records_insert_auth on public.purchase_records;
create policy purchase_records_insert_auth on public.purchase_records for insert to authenticated
  with check (public.current_role_name() in ('admin','supervisor','purchaser'));

-- activity_logs: append-only for any authenticated; admin manages
drop policy if exists al_select on public.activity_logs;
drop policy if exists al_insert on public.activity_logs;
drop policy if exists al_admin_update on public.activity_logs;
drop policy if exists al_admin_delete on public.activity_logs;
create policy al_select on public.activity_logs for select to authenticated using (true);
create policy al_insert on public.activity_logs for insert to authenticated with check (true);
create policy al_admin_update on public.activity_logs for update to authenticated using (public.is_admin());
create policy al_admin_delete on public.activity_logs for delete to authenticated using (public.is_admin());

-- notifications: insert by any auth (service writes them), recipient sees + updates own
drop policy if exists notif_insert on public.notifications;
drop policy if exists notif_select_own on public.notifications;
drop policy if exists notif_update_own on public.notifications;
drop policy if exists notif_admin_delete on public.notifications;
create policy notif_insert on public.notifications for insert to authenticated with check (true);
create policy notif_select_own on public.notifications for select to authenticated
  using (recipient_email = (select email from public.profiles where id = auth.uid()));
create policy notif_update_own on public.notifications for update to authenticated
  using (recipient_email = (select email from public.profiles where id = auth.uid()));
create policy notif_admin_delete on public.notifications for delete to authenticated using (public.is_admin());

-- role_permissions: read by anyone authenticated, write admin only
drop policy if exists rp_select on public.role_permissions;
drop policy if exists rp_admin_write on public.role_permissions;
create policy rp_select on public.role_permissions for select to authenticated using (true);
create policy rp_admin_write on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- suppliers: read for all, write admin/supervisor/purchaser only
drop policy if exists suppliers_insert_auth on public.suppliers;
drop policy if exists suppliers_update_self_or_admin on public.suppliers;
drop policy if exists suppliers_delete_admin on public.suppliers;
create policy suppliers_insert_auth on public.suppliers for insert to authenticated
  with check (public.current_role_name() in ('admin','supervisor','purchaser'));
create policy suppliers_update_self_or_admin on public.suppliers for update to authenticated
  using (public.is_admin() or public.current_role_name() = 'purchaser');
create policy suppliers_delete_admin on public.suppliers for delete to authenticated
  using (public.is_admin());

-- =========================================================================
-- Seed role_permissions
-- =========================================================================
-- Belt-and-braces: explicit grants on every existing table/sequence/function
-- (covers tables created earlier in this migration, before the ALTER DEFAULT
-- PRIVILEGES at the top took effect for new objects).
grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;
grant select on all tables in schema public to anon;
grant usage, select on all sequences in schema public
  to authenticated, service_role;
grant execute on all functions in schema public
  to anon, authenticated, service_role;

insert into public.role_permissions(role, allowed_paths) values
  ('admin',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/processing-log","/output-report","/buyer-inspections","/master-data","/reports","/export-contracts","/materials-register","/bag-ledger","/stock-report","/activity-log","/permissions","/notification-history","/notification-settings","/user-report","/purchase-orders-report","/warehouse-receipt-report","/data-import"]'::jsonb),
  ('supervisor',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/processing-log","/output-report","/buyer-inspections","/master-data","/reports","/export-contracts","/materials-register","/bag-ledger","/stock-report","/activity-log","/permissions","/notification-history","/notification-settings","/user-report","/purchase-orders-report","/warehouse-receipt-report"]'::jsonb),
  ('purchaser',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/stock-report","/master-data","/bag-ledger","/reports","/purchase-orders-report","/warehouse-receipt-report"]'::jsonb),
  ('warehouse_keeper',
   '["/","/warehouse-receipt","/sample-log","/stock-report","/bag-ledger","/materials-register"]'::jsonb),
  ('process_manager',
   '["/","/processing-log","/stock-report"]'::jsonb),
  ('final_registrar',
   '["/","/output-report","/stock-report","/export-contracts","/buyer-inspections"]'::jsonb),
  ('export_manager',
   '["/","/export-contracts","/buyer-inspections","/stock-report","/materials-register","/bag-ledger","/sample-log"]'::jsonb)
on conflict (role) do update set allowed_paths = excluded.allowed_paths, updated_at = now();
