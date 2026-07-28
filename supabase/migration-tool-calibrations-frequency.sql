-- Add calibration_frequency to tool calibrations.
begin;

alter table public.tool_calibrations
  add column if not exists calibration_frequency text;

update public.tool_calibrations
set calibration_frequency = 'annually'
where calibration_frequency is null or trim(calibration_frequency) = '';

commit;
