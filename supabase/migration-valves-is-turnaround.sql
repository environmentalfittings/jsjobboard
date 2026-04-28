-- Mark jobs that are customer turnarounds (for updates / reporting).
-- Run in Supabase SQL Editor if your project was created before this column existed.

alter table public.valves
  add column if not exists is_turnaround boolean not null default false;

comment on column public.valves.is_turnaround is 'Customer turnaround — flag for updates and filtered reports.';
