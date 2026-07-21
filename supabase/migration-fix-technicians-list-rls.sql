-- Technicians page showed only the logged-in person for shop admins.
-- Cause: authenticated SELECT required JWT app_metadata/user_metadata.role
-- in ('admin','manager'). Shop accounts often have Admin via profiles.role /
-- technicians.role instead, so RLS fell through to "own row only" (user_id = auth.uid()).
--
-- Fix:
-- 1) Authenticated users can read the full technicians list (needed for Admin
--    Technicians page, job board avatars, and assignment pickers).
-- 2) Write policies also accept profiles.role = 'admin' and technicians.role = 'admin'
--    (same pattern as migration-app-feedback-admin-rls-profiles.sql).

drop policy if exists "authenticated_read_technicians" on public.technicians;
drop policy if exists "technician read own profile" on public.technicians;
drop policy if exists "technician read_own_profile" on public.technicians;

create policy "authenticated_read_technicians"
on public.technicians
for select
to authenticated
using (true);

drop policy if exists "admin_insert_technicians" on public.technicians;
drop policy if exists "admin_update_technicians" on public.technicians;
drop policy if exists "admin_delete_technicians" on public.technicians;
drop policy if exists "admin_manager_insert_technicians" on public.technicians;
drop policy if exists "admin_manager_update_technicians" on public.technicians;
drop policy if exists "admin_manager_delete_technicians" on public.technicians;

create policy "admin_insert_technicians"
on public.technicians
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
);

create policy "admin_update_technicians"
on public.technicians
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
);

create policy "admin_delete_technicians"
on public.technicians
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
);
