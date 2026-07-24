-- Fix: assigning technicians fails with
--   new row violates row-level security policy for table "job_assignment_history"
-- because the valves update trigger inserts history as the caller (RLS blocked).
-- Run in Supabase SQL Editor.

alter table public.job_assignment_history enable row level security;

drop policy if exists "authenticated read job assignment history" on public.job_assignment_history;
create policy "authenticated read job assignment history"
on public.job_assignment_history
for select
to authenticated
using (true);

drop policy if exists "authenticated insert job assignment history" on public.job_assignment_history;
create policy "authenticated insert job assignment history"
on public.job_assignment_history
for insert
to authenticated
with check (true);

drop policy if exists "anon insert job assignment history" on public.job_assignment_history;
create policy "anon insert job assignment history"
on public.job_assignment_history
for insert
to anon
with check (true);

-- Trigger must bypass RLS even if policies are missing / incomplete.
create or replace function public.log_job_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.assigned_technician_id is distinct from new.assigned_technician_id then
    insert into public.job_assignment_history (job_id, assigned_to, assigned_by, assigned_at, notes, action)
    values (
      new.id,
      new.assigned_technician_id,
      new.assigned_by,
      coalesce(new.assigned_at, now()),
      new.assignment_notes,
      case
        when old.assigned_technician_id is null and new.assigned_technician_id is not null then 'assigned'
        when old.assigned_technician_id is not null and new.assigned_technician_id is null then 'unassigned'
        else 'reassigned'
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists valves_log_assignment_history on public.valves;
create trigger valves_log_assignment_history
after update on public.valves
for each row
execute function public.log_job_assignment_history();
