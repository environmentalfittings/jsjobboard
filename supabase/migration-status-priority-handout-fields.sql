-- Handout-only technician + notes on daily priority rows.
-- Also ensure department is allowed as scope_kind.
-- Run in Supabase SQL Editor.

alter table public.status_priority_queue drop constraint if exists status_priority_queue_scope_kind_check;
alter table public.status_priority_queue
  add constraint status_priority_queue_scope_kind_check
  check (scope_kind in ('status', 'cell', 'department'));

alter table public.status_priority_queue
  add column if not exists assigned_technician_id bigint references public.technicians (id) on delete set null;

alter table public.status_priority_queue
  add column if not exists handout_notes text;

-- Allow authenticated shop users to read change log (Reports yesterday section).
drop policy if exists "admin read valve change log" on public.valve_change_log;
drop policy if exists "authenticated read valve change log" on public.valve_change_log;

create policy "authenticated read valve change log"
on public.valve_change_log
for select
to authenticated
using (true);
