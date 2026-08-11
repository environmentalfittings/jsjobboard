-- Add Quoted and Lost to received_valves status.
-- Run once in Supabase SQL Editor (after migration-received-valves-status.sql).
-- Lost (like Converted) leaves the Dashboard log and stays in Reports.

begin;

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

commit;
