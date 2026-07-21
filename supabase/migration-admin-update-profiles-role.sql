-- Allow shop admins to update other users' profiles.role when changing
-- roles on the Technicians page (own-profile-only policy was too narrow).

drop policy if exists "admin_update_profiles" on public.profiles;

create policy "admin_update_profiles"
on public.profiles
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
