-- Superseded by migration-fix-technicians-list-rls.sql
-- (JWT-only admin/manager check still hid the full list for shop admins
-- whose Admin role lives on profiles / technicians rows).

drop policy if exists "authenticated_read_technicians" on public.technicians;

create policy "authenticated_read_technicians"
on public.technicians
for select
to authenticated
using (true);
