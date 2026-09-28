-- Allow anon SELECT on employees so Generic Admin (local DEV bypass, no auth session)
-- can load Roster & accounts. Matches existing anon insert/update policies in
-- migration-employees-write-policies.sql.
-- Run in Supabase SQL Editor. Safe to re-run.

begin;

drop policy if exists "anon read employees" on public.employees;
create policy "anon read employees"
on public.employees
for select
to anon
using (true);

commit;
