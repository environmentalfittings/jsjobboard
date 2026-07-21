-- Fix: "Database error creating new user" in Supabase Auth Dashboard.
-- Usually caused by the on_auth_user_created trigger failing when inserting public.profiles.
-- Run this entire script in the SQL Editor, then try Add user again.

-- 1) Make profile creation resilient (never block Auth inserts)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'admin',
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.email
    )
  )
  on conflict (id) do nothing;
  return new;
exception
  when others then
    raise warning 'handle_new_user skipped profile insert: %', sqlerrm;
    return new;
end;
$$;

-- 2) Recreate the Auth trigger pointing at the fixed function
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 3) Optional check (should return the trigger name)
select tgname, tgenabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal;
