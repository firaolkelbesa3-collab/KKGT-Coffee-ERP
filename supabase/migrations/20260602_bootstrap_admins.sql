-- =========================================================================
-- KKGT Import Export — bootstrap admins.
-- The two company owners should land as 'admin' the moment they sign in with
-- Google, without anyone having to flip their role manually first.
--
-- Apply AFTER 20260527_init.sql (it redefines handle_new_user). Idempotent.
-- Paste in the Supabase SQL Editor, or run `supabase db push`.
-- =========================================================================

-- Central list of bootstrap admin emails (lowercased).
create or replace function public.is_bootstrap_admin(p_email text)
returns boolean language sql immutable as $$
  select lower(coalesce(p_email, '')) in (
    'yohannesmulugeta084@gmail.com',
    'firaolkelbesa3@gmail.com'
  );
$$;

-- Re-create the new-user handler so bootstrap admins get role='admin' on signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id,
          new.email,
          coalesce(new.raw_user_meta_data->>'full_name',
                   new.raw_user_meta_data->>'name',
                   split_part(new.email,'@',1)),
          case when public.is_bootstrap_admin(new.email) then 'admin' else 'unassigned' end)
  on conflict (id) do update
    set role = case when public.is_bootstrap_admin(excluded.email)
                    then 'admin' else public.profiles.role end;
  return new;
end;
$$;

-- Promote any already-created profiles for those emails (in case they signed in
-- before this migration ran).
update public.profiles
   set role = 'admin'
 where public.is_bootstrap_admin(email)
   and role <> 'admin';
