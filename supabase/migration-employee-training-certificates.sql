-- Allow certificate PDFs on employee training files.
-- Run once in Supabase SQL Editor.

begin;

alter table public.employee_training_files
  drop constraint if exists employee_training_files_kind_check;

alter table public.employee_training_files
  add constraint employee_training_files_kind_check
  check (kind in ('material', 'test', 'completed_test', 'signoff', 'certificate', 'other'));

create index if not exists idx_employee_training_files_employee_training
  on public.employee_training_files (employee_id, training_id, kind);

commit;
