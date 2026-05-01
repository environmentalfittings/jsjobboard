begin;

alter table public.technicians
  add column if not exists login_username text;

alter table public.technicians
  add constraint technicians_login_username_format_chk
  check (
    login_username is null
    or login_username ~ '^[a-z0-9._-]{3,64}$'
  );

create unique index if not exists idx_technicians_login_username_lower_unique
  on public.technicians (lower(login_username))
  where login_username is not null and length(trim(login_username)) > 0;

drop policy if exists "anon_insert_technicians" on public.technicians;
drop policy if exists "anon_update_technicians" on public.technicians;
drop policy if exists "anon_delete_technicians" on public.technicians;
drop policy if exists "admin_manager_insert_technicians" on public.technicians;
drop policy if exists "admin_manager_update_technicians" on public.technicians;
drop policy if exists "admin_manager_delete_technicians" on public.technicians;
drop policy if exists "admin_insert_technicians" on public.technicians;
drop policy if exists "admin_update_technicians" on public.technicians;
drop policy if exists "admin_delete_technicians" on public.technicians;

create policy "admin_insert_technicians"
on public.technicians
for insert
to authenticated
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

create policy "admin_update_technicians"
on public.technicians
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

create policy "admin_delete_technicians"
on public.technicians
for delete
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

commit;
