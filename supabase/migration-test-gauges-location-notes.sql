-- Add department, notes, and calibration_frequency to the test gauges registry.
-- If an earlier "location" column was created, copy it into department.
begin;

alter table public.test_gauges
  add column if not exists department text,
  add column if not exists notes text,
  add column if not exists calibration_frequency text,
  add column if not exists location text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'test_gauges'
      and column_name = 'location'
  ) then
    update public.test_gauges
    set department = coalesce(nullif(trim(department), ''), nullif(trim(location), ''))
    where department is null or trim(department) = '';
  end if;
end $$;

update public.test_gauges
set calibration_frequency = 'annually'
where calibration_frequency is null or trim(calibration_frequency) = '';

alter table public.test_gauges
  drop column if exists location;

commit;
