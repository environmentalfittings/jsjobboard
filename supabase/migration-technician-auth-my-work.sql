begin;

alter table public.technicians add column if not exists user_id uuid references auth.users(id);
alter table public.technicians add column if not exists login_email text;
alter table public.valves add column if not exists assigned_technician_id bigint references public.technicians(id);
alter table public.technicians add column if not exists role text not null default 'technician'
  check (role in ('admin','manager','supervisor','technician'));
alter table public.technicians add column if not exists supervisor_id bigint references public.technicians(id);
alter table public.technicians add column if not exists manager_id bigint references public.technicians(id);
alter table public.valves add column if not exists assigned_by bigint references public.technicians(id);
alter table public.valves add column if not exists assigned_at timestamptz;
alter table public.valves add column if not exists assignment_notes text;
alter table public.valves add column if not exists needs_attention boolean not null default false;

create index if not exists idx_technicians_user_id on public.technicians(user_id);
create index if not exists idx_valves_assigned_technician_id on public.valves(assigned_technician_id);
create index if not exists idx_technicians_supervisor_id on public.technicians(supervisor_id);
create index if not exists idx_technicians_manager_id on public.technicians(manager_id);

create table if not exists public.job_assignment_history (
  id uuid primary key default gen_random_uuid(),
  job_id bigint not null references public.valves(id) on delete cascade,
  assigned_to bigint references public.technicians(id),
  assigned_by bigint references public.technicians(id),
  assigned_at timestamptz not null default now(),
  notes text,
  action text not null check (action in ('assigned', 'reassigned', 'unassigned'))
);

create or replace function public.log_job_assignment_history()
returns trigger
language plpgsql
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

drop policy if exists "public read valves" on public.valves;
drop policy if exists "public update valves" on public.valves;
drop policy if exists "public insert valves" on public.valves;
drop policy if exists "admin_manager_full_access" on public.valves;
drop policy if exists "anon_read_valves" on public.valves;
drop policy if exists "authenticated_read_valves" on public.valves;
drop policy if exists "anon_insert_valves" on public.valves;
drop policy if exists "anon_update_valves" on public.valves;
drop policy if exists "admin_manager_insert_valves" on public.valves;
drop policy if exists "admin_manager_update_valves" on public.valves;
drop policy if exists "supervisor_can_see_team_jobs" on public.valves;
drop policy if exists "supervisor_can_assign_team_jobs" on public.valves;
drop policy if exists "technician_own_jobs" on public.valves;
drop policy if exists "technician_update_own_jobs" on public.valves;

-- App still uses anon key for most reads/writes; keep anon access like the original schema.
create policy "anon_read_valves"
on public.valves
for select
to anon
using (true);

create policy "authenticated_read_valves"
on public.valves
for select
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
  or (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'supervisor'
    and (
      public.valves.assigned_technician_id in (
        select t.id
        from public.technicians t
        where t.supervisor_id = (select me.id from public.technicians me where me.user_id = auth.uid())
      )
      or public.valves.assigned_technician_id = (select me.id from public.technicians me where me.user_id = auth.uid())
    )
  )
  or (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('technician','tech')
    and public.valves.assigned_technician_id = (select me.id from public.technicians me where me.user_id = auth.uid())
  )
);

create policy "anon_insert_valves"
on public.valves
for insert
to anon
with check (true);

create policy "admin_manager_insert_valves"
on public.valves
for insert
to authenticated
with check (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
);

create policy "anon_update_valves"
on public.valves
for update
to anon
using (true)
with check (true);

create policy "admin_manager_update_valves"
on public.valves
for update
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
)
with check (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
);

create policy "supervisor_can_assign_team_jobs"
on public.valves
for update
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'supervisor'
)
with check (
  public.valves.assigned_technician_id in (
    select t.id
    from public.technicians t
    where t.supervisor_id = (select me.id from public.technicians me where me.user_id = auth.uid())
  )
);

create policy "technician_update_own_jobs"
on public.valves
for update
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('technician','tech')
  and public.valves.assigned_technician_id = (select me.id from public.technicians me where me.user_id = auth.uid())
)
with check (
  public.valves.assigned_technician_id = (select me.id from public.technicians me where me.user_id = auth.uid())
);

drop policy if exists "public read technicians" on public.technicians;
drop policy if exists "public insert technicians" on public.technicians;
drop policy if exists "public update technicians" on public.technicians;
drop policy if exists "public delete technicians" on public.technicians;
drop policy if exists "admin_manager_full_technicians" on public.technicians;
drop policy if exists "anon_read_technicians" on public.technicians;
drop policy if exists "authenticated_read_technicians" on public.technicians;
drop policy if exists "anon_insert_technicians" on public.technicians;
drop policy if exists "anon_update_technicians" on public.technicians;
drop policy if exists "anon_delete_technicians" on public.technicians;
drop policy if exists "admin_manager_insert_technicians" on public.technicians;
drop policy if exists "admin_manager_update_technicians" on public.technicians;
drop policy if exists "admin_manager_delete_technicians" on public.technicians;
drop policy if exists "technician read own profile" on public.technicians;
drop policy if exists "technician read_own_profile" on public.technicians;

create policy "anon_read_technicians"
on public.technicians
for select
to anon
using (true);

create policy "authenticated_read_technicians"
on public.technicians
for select
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
  or user_id = auth.uid()
);

create policy "anon_insert_technicians"
on public.technicians
for insert
to anon
with check (true);

create policy "admin_manager_insert_technicians"
on public.technicians
for insert
to authenticated
with check (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
);

create policy "anon_update_technicians"
on public.technicians
for update
to anon
using (true)
with check (true);

create policy "admin_manager_update_technicians"
on public.technicians
for update
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
)
with check (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
);

create policy "anon_delete_technicians"
on public.technicians
for delete
to anon
using (true);

create policy "admin_manager_delete_technicians"
on public.technicians
for delete
to authenticated
using (
  coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') in ('admin','manager')
);

create policy "technician read own profile"
on public.technicians
for select
to authenticated
using (user_id = auth.uid());

commit;
