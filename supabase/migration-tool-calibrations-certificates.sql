-- Certificate uploads for externally calibrated tools (torque wrenches, deadweight, etc.).
-- Run in Supabase SQL Editor after migration-tool-calibrations.sql.

begin;

alter table public.tool_calibrations
  add column if not exists certificate_storage_path text,
  add column if not exists certificate_file_name text,
  add column if not exists certificate_mime_type text;

commit;
