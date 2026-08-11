-- Add RFQ follow-up status on received valves.
-- Run once in Supabase SQL Editor (after migration-received-valves.sql).
-- Converted entries stay in the table for Reports but leave the Dashboard log.

begin;

alter table public.received_valves
  add column if not exists status text;

update public.received_valves
set status = 'waiting_on_salesman'
where status is null or btrim(status) = '';

alter table public.received_valves
  alter column status set default 'waiting_on_salesman';

alter table public.received_valves
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'received_valves_status_check'
  ) then
    alter table public.received_valves
      add constraint received_valves_status_check
      check (
        status in (
          'waiting_on_salesman',
          'waiting_on_customer',
          'converted'
        )
      );
  end if;
end $$;

create index if not exists idx_received_valves_status
  on public.received_valves (status);

commit;
