-- Allows signed-in users (including technicians) to create new jobs.
-- Run in Supabase SQL Editor.

drop policy if exists "admin_manager_insert_valves" on public.valves;
drop policy if exists "authenticated_insert_valves" on public.valves;

create policy "authenticated_insert_valves"
on public.valves
for insert
to authenticated
with check (true);
