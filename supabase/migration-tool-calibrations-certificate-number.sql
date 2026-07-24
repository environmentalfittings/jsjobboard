-- Certificate number + archive metadata for external calibrations.
-- Run after migration-tool-calibrations-certificates.sql and migration-tool-calibration-events.sql.

begin;

alter table public.tool_calibrations
  add column if not exists certificate_number text;

alter table public.tool_calibration_events
  add column if not exists certificate_number text,
  add column if not exists certificate_storage_path text,
  add column if not exists certificate_file_name text;

commit;
