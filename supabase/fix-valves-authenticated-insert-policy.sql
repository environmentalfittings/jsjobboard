-- Restores job-board visibility for authenticated sessions that do not carry
-- role claims in JWT (common with local username login flows).
-- Run in Supabase SQL Editor.

drop policy if exists "authenticated_read_valves" on public.valves;

create policy "authenticated_read_valves"
on public.valves
for select
to authenticated
using (true);
