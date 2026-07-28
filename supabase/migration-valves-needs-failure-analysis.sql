-- Flag jobs that need failure analysis.
-- Run in Supabase SQL Editor if your project was created before this column existed.

alter table public.valves
  add column if not exists needs_failure_analysis boolean not null default false;

comment on column public.valves.needs_failure_analysis is 'Job requires failure analysis / engineering review.';
