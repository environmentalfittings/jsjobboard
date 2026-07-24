-- Technician sign-off fields for tool calibration events.
-- Safe to run after migration-tool-calibration-events.sql.

begin;

alter table public.tool_calibration_events
  add column if not exists technician_id bigint,
  add column if not exists technician_name text,
  add column if not exists signed_off_at date;

-- Backfill sign-off from calibration date where missing.
update public.tool_calibration_events
set signed_off_at = calibrated_at
where signed_off_at is null;

update public.tool_calibration_events
set technician_name = tech_initials
where (technician_name is null or btrim(technician_name) = '')
  and tech_initials is not null
  and btrim(tech_initials) <> '';

commit;
