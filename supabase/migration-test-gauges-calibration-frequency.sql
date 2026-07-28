-- Add calibration_frequency to test gauges (run if department/notes already exist).
begin;

alter table public.test_gauges
  add column if not exists calibration_frequency text,
  add column if not exists notes text;

update public.test_gauges
set calibration_frequency = 'annually'
where calibration_frequency is null or trim(calibration_frequency) = '';

commit;
