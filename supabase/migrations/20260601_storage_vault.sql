-- =========================================================================
-- Document Vault — private Supabase Storage bucket for attachments
-- (purchase contracts, payment vouchers, GRNs, export docs).
-- Apply with `supabase db push` (after `supabase link`) or paste in SQL Editor.
-- =========================================================================

-- Private bucket, 10 MB cap, PDF + common image types only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 10485760,
  array['application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS on storage.objects is enabled by default in Supabase. Add policies
-- scoped to the 'attachments' bucket: any signed-in user can read/upload;
-- only admins/supervisors can delete (matches the app's attachment RBAC).
drop policy if exists "attachments_read" on storage.objects;
drop policy if exists "attachments_insert" on storage.objects;
drop policy if exists "attachments_update" on storage.objects;
drop policy if exists "attachments_delete" on storage.objects;

create policy "attachments_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments');

create policy "attachments_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments');

create policy "attachments_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments');

create policy "attachments_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and public.is_admin());

-- The attachments metadata table stores the storage PATH in file_url; keep an
-- explicit upload timestamp so the UI can show "uploaded on" after reload.
alter table public.attachments
  add column if not exists uploaded_at timestamptz default now();
