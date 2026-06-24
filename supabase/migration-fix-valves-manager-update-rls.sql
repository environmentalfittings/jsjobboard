-- Same JWT metadata bug as technicians: manager/admin updates checked top-level "authenticated" first.

drop policy if exists "admin_manager_update_valves" on public.valves;

create policy "admin_manager_update_valves"
on public.valves
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'manager')
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin', 'manager')
);
