-- Allow authenticated shop users to read valve_change_log
-- (Reports daily priority "Yesterday — status moves").
-- Run in Supabase SQL Editor if handout migration already ran without this.

drop policy if exists "admin read valve change log" on public.valve_change_log;
drop policy if exists "authenticated read valve change log" on public.valve_change_log;

create policy "authenticated read valve change log"
on public.valve_change_log
for select
to authenticated
using (true);
