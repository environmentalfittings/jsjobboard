-- Ensure received_valves has status + notes and allows Converted / Lost / Quoted.
-- Run once in Supabase SQL Editor if Converted/Lost status changes do not stick.

begin;

alter table public.received_valves
  add column if not exists status text;

alter table public.received_valves
  add column if not exists notes text;

update public.received_valves
set status = 'waiting_on_salesman'
where status is null or btrim(status) = '';

update public.received_valves
set notes = ''
where notes is null;

alter table public.received_valves
  alter column status set default 'waiting_on_salesman';

alter table public.received_valves
  alter column status set not null;

alter table public.received_valves
  alter column notes set default '';

alter table public.received_valves
  alter column notes set not null;

alter table public.received_valves
  drop constraint if exists received_valves_status_check;

alter table public.received_valves
  add constraint received_valves_status_check
  check (
    status in (
      'waiting_on_salesman',
      'waiting_on_customer',
      'quoted',
      'converted',
      'lost'
    )
  );

create index if not exists idx_received_valves_status
  on public.received_valves (status);

commit;
