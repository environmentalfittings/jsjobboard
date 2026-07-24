-- Allow authenticated admins/shop staff to add and update employee roster rows.
-- Run in Supabase SQL Editor if Add Employee fails on RLS.

begin;

drop policy if exists "authenticated insert employees" on public.employees;
create policy "authenticated insert employees"
on public.employees
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update employees" on public.employees;
create policy "authenticated update employees"
on public.employees
for update
to authenticated
using (true)
with check (true);

drop policy if exists "anon insert employees" on public.employees;
create policy "anon insert employees"
on public.employees
for insert
to anon
with check (true);

drop policy if exists "anon update employees" on public.employees;
create policy "anon update employees"
on public.employees
for update
to anon
using (true)
with check (true);

commit;
