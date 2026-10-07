-- Job needed-parts list (ITP traveler + shop purchasing board).
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.job_needed_parts (
  id uuid primary key,
  valve_row_id integer not null references public.valves(id) on delete cascade,
  itp_item_id text not null default '',
  itp_item_name text not null default '',
  part_name text not null default '',
  part_number text not null default '',
  quantity integer not null default 1,
  supplier text not null default '',
  status text not null default 'needed'
    check (status in ('needed', 'ordered', 'received', 'cancelled')),
  po_number text not null default '',
  ordered_date date,
  expected_date date,
  received_date date,
  notes text not null default '',
  requested_by_name text not null default '',
  requested_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_job_needed_parts_valve
  on public.job_needed_parts (valve_row_id, created_at desc);

create index if not exists idx_job_needed_parts_status
  on public.job_needed_parts (status, expected_date);

alter table public.job_needed_parts enable row level security;

drop policy if exists "authenticated read job needed parts" on public.job_needed_parts;
create policy "authenticated read job needed parts"
on public.job_needed_parts
for select
to authenticated
using (true);

drop policy if exists "authenticated insert job needed parts" on public.job_needed_parts;
create policy "authenticated insert job needed parts"
on public.job_needed_parts
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update job needed parts" on public.job_needed_parts;
create policy "authenticated update job needed parts"
on public.job_needed_parts
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete job needed parts" on public.job_needed_parts;
create policy "authenticated delete job needed parts"
on public.job_needed_parts
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.job_needed_parts to authenticated;

commit;
