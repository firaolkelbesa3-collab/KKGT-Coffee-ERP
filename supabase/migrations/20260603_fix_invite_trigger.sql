-- Fix: update handle_user_login to also accept pending invites when an
-- existing user signs in. This handles the case where an invite is created
-- AFTER the user already has an account.
create or replace function public.handle_user_login()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  -- Update last sign-in timestamp on the profile.
  update public.profiles
     set last_sign_in_at = now()
   where id = new.id;

  -- If there is a pending invite for this email, accept it and
  -- promote the role if the user is currently unassigned.
  select role into v_role
    from public.user_invites
   where lower(email) = lower(new.email) and status = 'pending'
   limit 1;

  if v_role is not null then
    -- Accept the invite.
    update public.user_invites
       set status = 'accepted', accepted_at = now()
     where lower(email) = lower(new.email) and status = 'pending';

    -- Promote the user's role only if they are currently unassigned.
    update public.profiles
       set role = v_role
     where id = new.id and role = 'unassigned';
  end if;

  return new;
end;
$$;

-- Re-attach to the correct event (Supabase updates last_sign_in_at on login).
drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.handle_user_login();
