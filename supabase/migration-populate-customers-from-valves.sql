-- Run once in Supabase SQL Editor.
--
-- Step 1: Ensure RLS is on and authenticated users can read customers
--         (anon read is needed so the New Job page works before login, if applicable).
-- Step 2: Pull every distinct, non-empty customer name from the valves table
--         and insert it into public.customers.  Duplicates (by name) are skipped.

begin;

-- Make sure the table has RLS enabled and a basic read policy
-- (safe to re-run; policies are dropped first).
alter table public.customers enable row level security;

drop policy if exists "all read customers" on public.customers;
create policy "all read customers"
on public.customers
for select
to anon, authenticated
using (true);

drop policy if exists "admin manage customers" on public.customers;
create policy "admin manage customers"
on public.customers
for all
to authenticated
using (
  coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata'  ->> 'role'
  ) = 'admin'
)
with check (
  coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata'  ->> 'role'
  ) = 'admin'
);

-- Populate from existing valve records.
-- Trims whitespace, skips blanks and duplicates.
insert into public.customers (name)
select distinct trim(customer)
from   public.valves
where  customer is not null
  and  trim(customer) <> ''
order  by trim(customer)
on conflict (name) do nothing;

commit;

-- After running, verify with:
-- select count(*), min(name), max(name) from public.customers;
