-- Add recertification interval + due date to employee trainings.
-- Run once in Supabase SQL Editor after migration-employee-training-module.sql.

begin;

alter table public.employee_trainings
  add column if not exists recert_interval text not null default '';

alter table public.employee_trainings
  add column if not exists recert_due_date date;

-- Drop then re-add check so re-runs are safe.
alter table public.employee_trainings
  drop constraint if exists employee_trainings_recert_interval_check;

alter table public.employee_trainings
  add constraint employee_trainings_recert_interval_check
  check (
    recert_interval in (
      '',
      '6_months',
      '1_year',
      '2_year',
      '3_year',
      '4_year',
      '5_year',
      '6_year',
      '7_year',
      '8_year',
      '9_year',
      '10_year'
    )
  );

create index if not exists idx_employee_trainings_recert_due
  on public.employee_trainings (recert_due_date nulls last, id desc);

commit;
