-- Distinguish pre-test vs final test on job cards.
-- date_tested remains the final / shop test date.
-- date_pre_tested is set for as-received / pretest stamps.
-- Run once in Supabase SQL Editor.

begin;

alter table public.valves
  add column if not exists date_pre_tested date;

comment on column public.valves.date_pre_tested is
  'Date the valve was pre-tested (as-received / pretest). Final shop test stays in date_tested.';

commit;
