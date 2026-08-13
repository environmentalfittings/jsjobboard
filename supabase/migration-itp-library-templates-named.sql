-- Named ITP library templates: multiple templates per job type + valve type
-- (e.g. Twinseal / MJ / Nordstrom under the same 4 WAY Diverter Valve).
--
-- REQUIRED for the current app. Without this migration, Admin → ITP template builder
-- returns HTTP 400 on GET/POST because the client selects name + is_default and upserts
-- on (job_type, valve_type, name).
--
-- Run once in Supabase SQL Editor AFTER (or after) using the template builder,
-- after migration-itp-library-templates.sql has created the base table.
--
-- Verify afterward:
--   select column_name
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'itp_library_templates'
--   order by 1;
-- Expect: created_at, id, is_default, job_type, name, scope, updated_at, valve_type

begin;

alter table public.itp_library_templates
  add column if not exists name text;

alter table public.itp_library_templates
  add column if not exists is_default boolean;

update public.itp_library_templates
set
  name = coalesce(nullif(trim(name), ''), 'Default'),
  is_default = coalesce(
    is_default,
    case
      when job_type = '__master__' and valve_type = '__master__' then false
      else true
    end
  )
where true;

alter table public.itp_library_templates
  alter column name set default 'Default';

alter table public.itp_library_templates
  alter column name set not null;

alter table public.itp_library_templates
  alter column is_default set default false;

alter table public.itp_library_templates
  alter column is_default set not null;

alter table public.itp_library_templates
  drop constraint if exists itp_library_templates_job_valve_unique;

alter table public.itp_library_templates
  drop constraint if exists itp_library_templates_job_valve_name_unique;

alter table public.itp_library_templates
  add constraint itp_library_templates_job_valve_name_unique
  unique (job_type, valve_type, name);

drop index if exists itp_library_templates_one_default;
create unique index itp_library_templates_one_default
  on public.itp_library_templates (job_type, valve_type)
  where is_default = true;

commit;
