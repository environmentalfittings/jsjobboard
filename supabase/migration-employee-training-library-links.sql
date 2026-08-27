-- Training library: allow URL links in addition to uploaded files.
-- Description uses existing employee_training_files.notes.
-- Run in Supabase SQL Editor. Safe to re-run.

alter table public.employee_training_files
  add column if not exists external_url text;

alter table public.employee_training_files
  alter column storage_path drop not null;

alter table public.employee_training_files
  alter column file_name set default '';

do $$
declare
  constraint_name text;
begin
  select c.conname
  into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'employee_training_files'
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) ilike '%storage_path%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.employee_training_files drop constraint %I', constraint_name);
  end if;
end $$;

drop index if exists employee_training_files_storage_path_key;
drop index if exists employee_training_files_storage_path_uidx;

create unique index if not exists employee_training_files_storage_path_uidx
  on public.employee_training_files (storage_path)
  where storage_path is not null and length(trim(storage_path)) > 0;

comment on column public.employee_training_files.external_url is
  'When set, this library/session item is an external URL instead of a storage upload.';
comment on column public.employee_training_files.notes is
  'Optional description shown in the training library.';
