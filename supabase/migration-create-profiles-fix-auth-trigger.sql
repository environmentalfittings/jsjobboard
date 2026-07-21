-- Fix Auth "Database error creating new user"
-- Root cause: trigger on_auth_user_created inserts into public.profiles, but profiles is missing.
-- Run this entire script in the Supabase SQL Editor, then Add user again.

-- 1) Create profiles if missing
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid,
  role text not null default 'admin'
    check (role in ('admin', 'viewer', 'customer')),
  full_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Optional FK to employees when that table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees'
  ) then
    begin
      alter table public.profiles
        drop constraint if exists profiles_employee_id_fkey;
      alter table public.profiles
        add constraint profiles_employee_id_fkey
        foreign key (employee_id) references public.employees(id);
    exception
      when others then
        raise notice 'profiles.employee_id FK skipped: %', sqlerrm;
    end;
  end if;
end $$;

create or replace function public.update_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_profiles_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "staff_read_profiles" on public.profiles;
create policy "staff_read_profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "staff_own_profile_update" on public.profiles;
create policy "staff_own_profile_update"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Allow trigger/service inserts
drop policy if exists "service_insert_profiles" on public.profiles;
create policy "service_insert_profiles"
  on public.profiles for insert
  with check (true);

-- 2) Resilient new-user trigger (schema-qualified, never blocks Auth)
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
    case
      when lower(coalesce(new.raw_user_meta_data->>'role', '')) = 'admin' then 'admin'
      else 'viewer'
    end,
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 3) Verify
select 'profiles exists' as check,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) as ok;
