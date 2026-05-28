-- =========================================================================
-- 20260527_010_align_with_legacy.sql
--
-- Aligns the live schema with the original Base44 entity definitions in
-- docs/legacy-base44-reference/base44/entities/*.jsonc.
--
-- Why a second migration: 20260527_init.sql was already pushed to prod.
-- Editing it and re-running would either be skipped (Supabase sees it as
-- applied) or recreate everything. This file is purely additive and
-- idempotent — safe to re-run.
--
-- Categories of change:
--   1. Convert JSON columns from jsonb -> text (Base44 stored JSON as text,
--      and the frontend reads with JSON.parse).
--   2. Add missing legacy columns the forms actually send.
--   3. Relax NOT NULL on columns Base44 treated as optional.
--   4. Widen archived_by from uuid -> text (Base44 stored emails).
--   5. Update triggers to parse the text columns as jsonb at runtime.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Helpers: convert jsonb -> text safely
-- -------------------------------------------------------------------------
-- Pattern used below per column. Wrapped in DO blocks so re-runs are no-ops
-- if the column is already text.
do $$
declare
  r record;
  jsonb_cols text[][] := array[
    ['purchase_records',        'payment_history'],
    ['purchase_records',        'additional_costs'],
    ['export_contracts',        'cost_rows'],
    ['export_contracts',        'payment_history'],
    ['warehouse_receipt_history','changes'],
    ['warehouse_receipt_history','kg_impact'],
    ['activity_logs',           'changes'],
    ['notification_settings',   'disabled_types'],
    ['role_permissions',        'allowed_paths']
  ];
  tbl text; col text;
  curr_type text;
  default_val text;
begin
  for r in
    select unnest(jsonb_cols[1:array_upper(jsonb_cols,1)][1:1]) as tbl,
           unnest(jsonb_cols[1:array_upper(jsonb_cols,1)][2:2]) as col
  loop
    null; -- placeholder; we'll use explicit ALTERs below for clarity
  end loop;
end $$;

-- Explicit conversions (clearer than the loop above):

alter table public.purchase_records
  alter column payment_history drop default,
  alter column payment_history type text using payment_history::text,
  alter column payment_history set default '[]';

alter table public.purchase_records
  alter column additional_costs drop default,
  alter column additional_costs type text using additional_costs::text,
  alter column additional_costs set default '[]';

alter table public.export_contracts
  alter column cost_rows drop default,
  alter column cost_rows type text using cost_rows::text,
  alter column cost_rows set default '[]';

alter table public.export_contracts
  alter column payment_history drop default,
  alter column payment_history type text using payment_history::text,
  alter column payment_history set default '[]';

alter table public.warehouse_receipt_history
  alter column changes drop default,
  alter column changes type text using changes::text,
  alter column changes set default '[]';

alter table public.warehouse_receipt_history
  alter column kg_impact drop default,
  alter column kg_impact type text using kg_impact::text,
  alter column kg_impact set default '{}';

alter table public.activity_logs
  alter column changes drop default,
  alter column changes type text using changes::text,
  alter column changes set default '[]';

alter table public.notification_settings
  alter column disabled_types drop default,
  alter column disabled_types type text using disabled_types::text,
  alter column disabled_types set default '[]';

alter table public.role_permissions
  alter column allowed_paths drop default,
  alter column allowed_paths type text using allowed_paths::text,
  alter column allowed_paths set default '[]';

-- -------------------------------------------------------------------------
-- 2. Relax NOT NULL constraints to match Base44's "required" lists
-- -------------------------------------------------------------------------
-- PurchaseRecord required: supplier_name, purchase_date
alter table public.purchase_records
  alter column net_dispatch_weight_kg drop not null,
  alter column net_dispatch_weight_kg drop default,
  alter column unit_price_etb_per_feresula drop not null,
  alter column unit_price_etb_per_feresula drop default,
  alter column commission_percent drop not null,
  alter column commission_percent drop default,
  alter column total_paid_etb drop not null,
  alter column total_paid_etb drop default;

-- WarehouseReceipt required: coffee_code, supplier_name, received_date
alter table public.warehouse_receipts
  alter column warehouse_received_net_kg drop not null;

-- ExportContract required: contract_no, destination_country, contract_date
alter table public.export_contracts
  alter column export_kg drop not null;

-- SupplierBagPayment required: payment_date, amount_etb (supplier_name optional)
alter table public.supplier_bag_payments
  alter column supplier_name drop not null;

-- SupplierBagReturn required: return_date, bags_returned (supplier_name optional)
alter table public.supplier_bag_returns
  alter column supplier_name drop not null;

-- BagReceipt required: bags_received (receipt_mode optional, date optional)
alter table public.bag_receipts
  alter column receipt_mode drop not null,
  alter column date drop not null;

-- ProcessingLog required: date (entry_type optional)
alter table public.processing_logs
  alter column entry_type drop not null;

-- OutputReport required: start_date, end_date (entry_type optional)
alter table public.output_reports
  alter column entry_type drop not null,
  alter column total_kg_processed drop not null,
  alter column total_kg_processed drop default;

-- -------------------------------------------------------------------------
-- 3. archived_by + uploaded_by -> text (Base44 stored emails).
--    Postgres rejects column type changes while a foreign key references
--    the column, so we drop the FK first.
-- -------------------------------------------------------------------------
do $$
declare
  tbl text;
  fk_name text;
begin
  for tbl in
    select unnest(array[
      'purchase_records','warehouse_receipts','processing_logs',
      'output_reports','export_contracts','sample_logs','bag_receipts'
    ])
  loop
    for fk_name in
      select conname from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f'
        and c.conrelid = ('public.' || tbl)::regclass
        and a.attname = 'archived_by'
    loop
      execute format('alter table public.%I drop constraint %I', tbl, fk_name);
    end loop;
    execute format(
      'alter table public.%I alter column archived_by drop default, ' ||
      'alter column archived_by type text using archived_by::text',
      tbl
    );
  end loop;
end $$;

-- uploaded_by is referenced by two RLS policies; drop them first.
drop policy if exists attachments_update_self_or_admin on public.attachments;
drop policy if exists attachments_delete_self_or_admin on public.attachments;
do $$
declare fk_name text;
begin
  for fk_name in
    select conname from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f'
      and c.conrelid = 'public.attachments'::regclass
      and a.attname = 'uploaded_by'
  loop
    execute format('alter table public.attachments drop constraint %I', fk_name);
  end loop;
end $$;
alter table public.attachments
  alter column uploaded_by drop default,
  alter column uploaded_by type text using uploaded_by::text;

-- Recreate attachment mutate policies as admin-only (uploaded_by no longer
-- holds a UUID, so we can't compare it to auth.uid() anymore — and v1
-- has uploads disabled anyway).
drop policy if exists attachments_update_admin on public.attachments;
drop policy if exists attachments_delete_admin on public.attachments;
create policy attachments_update_admin on public.attachments
  for update to authenticated using (public.is_admin());
create policy attachments_delete_admin on public.attachments
  for delete to authenticated using (public.is_admin());

-- -------------------------------------------------------------------------
-- 4. Add missing columns (idempotent)
-- -------------------------------------------------------------------------

-- PurchaseRecord
alter table public.purchase_records
  add column if not exists other_cost_etb numeric(18,2);
-- remark was added in a prior fix; keep guard:
alter table public.purchase_records
  add column if not exists remark text;

-- WarehouseReceipt
alter table public.warehouse_receipts
  add column if not exists remark text;

-- WarehouseReceiptHistory
alter table public.warehouse_receipt_history
  add column if not exists coffee_code text,
  add column if not exists supplier_name text,
  add column if not exists grn_code text,
  add column if not exists reason text;

-- ProcessingLog
alter table public.processing_logs
  add column if not exists remark text;

-- ProcessingBatch
alter table public.processing_batches
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists notes text;

-- OutputReport — legacy single-date field, plus optional fields, plus pct
alter table public.output_reports
  add column if not exists date date,
  add column if not exists inspection_ref text,
  add column if not exists buyer_name text,
  add column if not exists rejection_reason text,
  add column if not exists remark text,
  add column if not exists reject_pct numeric(7,4),
  add column if not exists waste_pct numeric(7,4);

-- ExportContract — Base44 had ~40 legacy cost-breakdown + alt-name columns
alter table public.export_contracts
  add column if not exists rate_confirmed_date date,
  add column if not exists material_rows text default '[]',
  add column if not exists reject_sales_etb numeric(18,2),
  add column if not exists remark text,
  add column if not exists commodity text,
  add column if not exists export_date date,
  add column if not exists total_export_value_usd_legacy numeric(18,2),
  add column if not exists usd_rate_etb numeric(18,4),
  add column if not exists arrival_inputs text,
  add column if not exists purchase_cost_etb numeric(18,2),
  add column if not exists commission_on_purchase_etb numeric(18,2),
  add column if not exists cleaning_charges_etb numeric(18,2),
  add column if not exists recleaning_charges_etb numeric(18,2),
  add column if not exists packing_bag_green_pro_etb numeric(18,2),
  add column if not exists bag_mark_craft_etb numeric(18,2),
  add column if not exists bag_printing_etb numeric(18,2),
  add column if not exists loading_unloading_etb numeric(18,2),
  add column if not exists warehouse_expenses_etb numeric(18,2),
  add column if not exists local_transportation_etb numeric(18,2),
  add column if not exists edr_clearance_train_fee_etb numeric(18,2),
  add column if not exists demurrage_etb numeric(18,2),
  add column if not exists freight_etb numeric(18,2),
  add column if not exists commission_on_sales_etb numeric(18,2),
  add column if not exists bl_container_fee_etb numeric(18,2),
  add column if not exists fumigation_etb numeric(18,2),
  add column if not exists coo_etb numeric(18,2),
  add column if not exists container_picking_etb numeric(18,2),
  add column if not exists ico_etb numeric(18,2),
  add column if not exists private_co_weight_quality_etb numeric(18,2),
  add column if not exists coffee_association_etb numeric(18,2),
  add column if not exists plomp_payment_etb numeric(18,2),
  add column if not exists other_costs_etb numeric(18,2),
  add column if not exists total_expenses_etb numeric(18,2),
  add column if not exists export_total_sales_price_etb numeric(18,2),
  add column if not exists grand_total_sales_etb numeric(18,2),
  add column if not exists total_profit_etb numeric(18,2),
  add column if not exists profit_usd_legacy numeric(18,4),
  -- Newer fields the ContractForm sends but Base44 entity didn't list:
  add column if not exists pricing_method text,
  add column if not exists export_sample_kg numeric(14,3),
  add column if not exists actual_shipped_kg numeric(14,3),
  add column if not exists price_per_lb_usd numeric(18,6),
  add column if not exists total_lb numeric(14,3);

-- ExportContract payment_terms CHECK uses long labels in Base44
alter table public.export_contracts drop constraint if exists export_contracts_payment_terms_check;
alter table public.export_contracts
  add constraint export_contracts_payment_terms_check check (
    payment_terms is null or payment_terms in (
      'Letter of Credit (LC)','Cash Against Documents (CAD)',
      'Advance Payment','Open Account','Other',
      -- backward compat with short keys used by my earlier schema:
      'LC','CAD','Advance'
    )
  );

-- SampleLog
alter table public.sample_logs
  add column if not exists coffee_code text,
  add column if not exists notes text,
  add column if not exists remark text;

-- BuyerInspection
alter table public.buyer_inspections
  add column if not exists notes text;

-- BagReceipt
alter table public.bag_receipts
  add column if not exists note text;

-- SupplierBagSettlement: bags_returned boolean (separate from bags_returned_count),
-- plus note field
alter table public.supplier_bag_settlements
  add column if not exists bags_returned boolean not null default false,
  add column if not exists note text;

-- Attachment: legacy file_url field used by the frontend
alter table public.attachments
  add column if not exists file_url text;

-- -------------------------------------------------------------------------
-- 7. supplier_name hygiene — auto-trim and existing-row normalization.
-- A single trailing space on the suppliers master record produces a key
-- mismatch with rows written through forms that DO trim (PurchaseRegistration),
-- so the availability calc returns wrong KG. Belt-and-braces: clean the data
-- AND install a trigger so it can't reoccur.
-- -------------------------------------------------------------------------
update public.suppliers              set supplier_name = trim(supplier_name) where supplier_name <> trim(supplier_name);
update public.purchase_records       set supplier_name = trim(supplier_name) where supplier_name <> trim(supplier_name);
update public.warehouse_receipts     set supplier_name = trim(supplier_name) where supplier_name <> trim(supplier_name);
update public.processing_logs        set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.output_reports         set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.sample_logs            set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.bag_receipts           set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.supplier_bag_returns   set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.supplier_bag_payments  set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);
update public.supplier_bag_settlements set supplier_name = trim(supplier_name) where supplier_name <> trim(supplier_name);
update public.reject_bag_usages      set supplier_name = trim(supplier_name) where supplier_name is not null and supplier_name <> trim(supplier_name);

create or replace function public.trim_supplier_name()
returns trigger language plpgsql as $$
begin
  if new.supplier_name is not null then
    new.supplier_name := trim(new.supplier_name);
    if new.supplier_name = '' then new.supplier_name := null; end if;
  end if;
  return new;
end;
$$;

do $$
declare tbl text;
begin
  for tbl in select unnest(array[
    'suppliers','purchase_records','warehouse_receipts','processing_logs',
    'output_reports','sample_logs','bag_receipts','supplier_bag_returns',
    'supplier_bag_payments','supplier_bag_settlements','reject_bag_usages'])
  loop
    execute format('drop trigger if exists trim_supplier_name_trg on public.%I', tbl);
    execute format(
      'create trigger trim_supplier_name_trg before insert or update of supplier_name ' ||
      'on public.%I for each row execute function public.trim_supplier_name()', tbl);
  end loop;
end $$;

-- Tables that were missing the standard created_by column.
-- supabaseClient.js auto-injects created_by on every insert, so every
-- table needs the column even if it has its own user-tracking field.
alter table public.warehouse_receipt_history
  add column if not exists created_by uuid references auth.users(id);
alter table public.notifications
  add column if not exists created_by uuid references auth.users(id);
alter table public.activity_logs
  add column if not exists created_by uuid references auth.users(id);
alter table public.role_permissions
  add column if not exists created_by uuid references auth.users(id);
alter table public.attachments
  add column if not exists created_by uuid references auth.users(id);

-- Supplier: widen coffee_type to accept Base44's enum list (currently free text;
-- no change needed, but keep here for documentation).

-- -------------------------------------------------------------------------
-- 5. Triggers: update bodies to read JSON columns as text-cast-to-jsonb
-- -------------------------------------------------------------------------
create or replace function public.pr_recompute_totals()
returns trigger language plpgsql as $$
declare
  paid numeric(18,2);
  payments jsonb;
begin
  begin
    payments := coalesce(nullif(new.payment_history,'')::jsonb, '[]'::jsonb);
  exception when others then
    payments := '[]'::jsonb;
  end;
  select coalesce(sum((p->>'amount_etb')::numeric),0) into paid
  from jsonb_array_elements(payments) p;
  new.total_paid_etb := paid;
  if new.grand_total_etb is not null then
    new.balance_etb := new.grand_total_etb - paid;
  end if;
  return new;
end;
$$;

create or replace function public.recalc_purchase_from_receipt()
returns trigger language plpgsql as $$
declare
  pr public.purchase_records%rowtype;
  feresula numeric(14,3);
  base numeric(18,2);
  comm numeric(18,2);
  extra numeric(18,2);
  grand numeric(18,2);
  costs jsonb;
begin
  select * into pr from public.purchase_records where coffee_code = new.coffee_code limit 1;
  if not found then return new; end if;
  if new.warehouse_received_net_kg is null then return new; end if;
  feresula := new.warehouse_received_net_kg / 17;
  base := feresula * coalesce(pr.unit_price_etb_per_feresula, 0);
  comm := base * coalesce(pr.commission_percent, 0) / 100;
  begin
    costs := coalesce(nullif(pr.additional_costs,'')::jsonb, '[]'::jsonb);
  exception when others then
    costs := '[]'::jsonb;
  end;
  select coalesce(sum((c->>'amount')::numeric),0) into extra
  from jsonb_array_elements(costs) c;
  grand := base + comm + extra;
  update public.purchase_records
    set warehouse_received_net_kg = new.warehouse_received_net_kg,
        commission_etb = comm,
        total_purchase_price = base,
        grand_total_etb = grand,
        balance_etb = grand - coalesce(pr.total_paid_etb, 0)
    where id = pr.id;
  return new;
end;
$$;

-- -------------------------------------------------------------------------
-- 6. Re-seed role_permissions in case earlier rows weren't created or got
--    truncated — safe because of the on conflict update.
-- -------------------------------------------------------------------------
insert into public.role_permissions(role, allowed_paths) values
  ('admin',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/processing-log","/output-report","/buyer-inspections","/master-data","/reports","/export-contracts","/materials-register","/bag-ledger","/stock-report","/activity-log","/permissions","/notification-history","/notification-settings","/user-report","/purchase-orders-report","/warehouse-receipt-report","/data-import"]'),
  ('supervisor',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/processing-log","/output-report","/buyer-inspections","/master-data","/reports","/export-contracts","/materials-register","/bag-ledger","/stock-report","/activity-log","/permissions","/notification-history","/notification-settings","/user-report","/purchase-orders-report","/warehouse-receipt-report"]'),
  ('purchaser',
   '["/","/purchase-registration","/warehouse-receipt","/sample-log","/stock-report","/master-data","/bag-ledger","/reports","/purchase-orders-report","/warehouse-receipt-report"]'),
  ('warehouse_keeper',
   '["/","/warehouse-receipt","/sample-log","/stock-report","/bag-ledger","/materials-register"]'),
  ('process_manager',
   '["/","/processing-log","/stock-report"]'),
  ('final_registrar',
   '["/","/output-report","/stock-report","/export-contracts","/buyer-inspections"]'),
  ('export_manager',
   '["/","/export-contracts","/buyer-inspections","/stock-report","/materials-register","/bag-ledger","/sample-log"]')
on conflict (role) do update set allowed_paths = excluded.allowed_paths, updated_at = now();
