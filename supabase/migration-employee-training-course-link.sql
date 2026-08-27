-- Link scheduled / in-progress training records to a Library course package.
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.employee_trainings
  add column if not exists course_id bigint references public.employee_training_courses (id) on delete set null;

create index if not exists idx_employee_trainings_course
  on public.employee_trainings (course_id);

comment on column public.employee_trainings.course_id is
  'Optional link to Employee Training → Library course package (materials, agenda, test).';
