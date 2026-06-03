-- Export contracts: shipping container number + certificate number.
alter table public.export_contracts
  add column if not exists container_no   text,
  add column if not exists certificate_no text;
