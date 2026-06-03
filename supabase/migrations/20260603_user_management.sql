-- =========================================================================
-- User Management — invite system + role management UI support.
-- =========================================================================

-- ── 1. Invite table ───────────────────────────────────────────────────────
-- Admins create a row here BEFORE the user signs in.
-- The updated handle_new_user trigger reads it on first sign-in and assigns
-- the pre-selected role automatically.
create table if not exists public.user_invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  role         text not null check (role in ('admin','supervisor','purchaser',
                 'warehouse_keeper','process_manager','final_registrar','export_manager')),
  invited_by   uuid references auth.users(id) on delete set null,
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  status       text not null default 'pending' check (status in ('pending','accepted','revoked')),
  note         text,
  constraint user_invites_email_unique unique (email)
);

alter table public.user_invites enable row level security;
drop policy if exists "invites_admin_all"  on public.user_invites;
drop policy if exists "invites_self_read"  on public.user_invites;
create policy "invites_admin_all" on public.user_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Let the trigger (security definer) access this table without RLS issues
create policy "invites_self_read" on public.user_invites
  for select to authenticated
  using (lower(email) = lower((select email from public.profiles where id = auth.uid())));

-- ── 2. Expose profiles to admin ───────────────────────────────────────────
-- Add a column so admins can deactivate users without deleting them.
alter table public.profiles
  add column if not exists last_sign_in_at timestamptz,
  add column if not exists invited_by      uuid references auth.users(id) on delete set null;

-- ── 3. Re-create handle_new_user to honour invites ────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role       text;
  v_invited_by uuid;
begin
  -- Priority 1: bootstrap admin emails always get 'admin'.
  if public.is_bootstrap_admin(new.email) then
    v_role := 'admin';

  -- Priority 2: a pending invite for this email.
  else
    select role, invited_by
      into v_role, v_invited_by
      from public.user_invites
      where lower(email) = lower(new.email) and status = 'pending'
      limit 1;

    -- Mark the invite accepted.
    if v_role is not null then
      update public.user_invites
         set status = 'accepted', accepted_at = now()
       where lower(email) = lower(new.email) and status = 'pending';
    else
      v_role := 'unassigned';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, role, invited_by, last_sign_in_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email,'@',1)),
    v_role,
    v_invited_by,
    now()
  )
  on conflict (id) do update
    set last_sign_in_at = now(),
        -- Only promote role if the account was unassigned and an invite now exists.
        role = case
          when public.is_bootstrap_admin(excluded.email) then 'admin'
          when profiles.role = 'unassigned' and v_role <> 'unassigned' then v_role
          else profiles.role
        end;

  return new;
end;
$$;

-- Re-attach the trigger (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Also update last_sign_in_at on subsequent logins.
create or replace function public.handle_user_login()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set last_sign_in_at = now()
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_user_login();

-- ── 4. Grant service-role access for admin API calls ─────────────────────
grant select, insert, update, delete on public.user_invites to service_role;
grant select, update on public.profiles to service_role;
