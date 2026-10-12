-- Pre-test required on the job card (all valve types).
-- Run in Supabase SQL Editor if your project was created before this column existed.

alter table public.valves
  add column if not exists pre_test_required boolean not null default false;

comment on column public.valves.pre_test_required is
  'Shop must run a pre-test. Forced on when failure analysis is required.';
