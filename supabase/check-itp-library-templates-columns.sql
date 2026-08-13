-- Quick check: does itp_library_templates have the columns the app selects?
-- Run in Supabase SQL Editor for project vhblzjgthabvwpwixnqo (or your linked project).

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'itp_library_templates'
order by ordinal_position;

-- Required by the current app (TEMPLATE_SELECT):
--   id, job_type, valve_type, name, is_default, scope, updated_at
--
-- If name / is_default are missing, run:
--   supabase/migration-itp-library-templates-named.sql
