-- Move tool_calibrations with category Gauges or Load Cells into test_gauges.
-- Skips rows whose serial_number or js_id already exists as a test gauge_number.
-- Then deletes those source rows from tool_calibrations.
-- Run in Supabase SQL Editor after migration-tool-calibrations-category.sql.

begin;

with source as (
  select
    tc.*,
    case
      when lower(btrim(coalesce(tc.serial_number, ''))) in ('n/a', 'na', '') then null
      else nullif(btrim(tc.serial_number), '')
    end as serial_clean,
    nullif(btrim(tc.js_id), '') as js_clean
  from public.tool_calibrations tc
  where lower(btrim(coalesce(tc.category, ''))) in ('gauges', 'load cells')
),
candidates as (
  select
    s.*,
    coalesce(s.serial_clean, s.js_clean) as gauge_number
  from source s
  where coalesce(s.serial_clean, s.js_clean) is not null
)
insert into public.test_gauges (
  gauge_number,
  gauge_id,
  manufacturer,
  gauge_type,
  last_calibration_date,
  next_calibration_date,
  active
)
select
  c.gauge_number,
  c.gauge_number,
  nullif(btrim(c.manufacturer), ''),
  case
    when lower(btrim(c.category)) = 'load cells' then 'Load Cell'
    when coalesce(c.tool_type, '') ~* 'helium' then 'Helium'
    when coalesce(c.tool_type, '') ~* 'chart\s*recorder' then 'Chart recorder'
    when coalesce(c.tool_type, '') ~* 'pressure' then 'Pressure'
    else coalesce(nullif(btrim(c.tool_type), ''), 'Pressure')
  end,
  c.calibration_date,
  c.expiration_date,
  (c.active and c.status = 'active')
from candidates c
where not exists (
  select 1
  from public.test_gauges tg
  where lower(regexp_replace(btrim(tg.gauge_number), '[\s_-]+', '', 'g'))
    in (
      lower(regexp_replace(btrim(coalesce(c.serial_clean, '')), '[\s_-]+', '', 'g')),
      lower(regexp_replace(btrim(coalesce(c.js_clean, '')), '[\s_-]+', '', 'g')),
      lower(regexp_replace(btrim(c.gauge_number), '[\s_-]+', '', 'g'))
    )
    and btrim(tg.gauge_number) <> ''
)
and c.id = (
  select min(c2.id)
  from candidates c2
  where lower(regexp_replace(btrim(c2.gauge_number), '[\s_-]+', '', 'g'))
    = lower(regexp_replace(btrim(c.gauge_number), '[\s_-]+', '', 'g'))
);

delete from public.tool_calibrations tc
where lower(btrim(coalesce(tc.category, ''))) in ('gauges', 'load cells')
  and coalesce(
    case
      when lower(btrim(coalesce(tc.serial_number, ''))) in ('n/a', 'na', '') then null
      else nullif(btrim(tc.serial_number), '')
    end,
    nullif(btrim(tc.js_id), '')
  ) is not null;

commit;
