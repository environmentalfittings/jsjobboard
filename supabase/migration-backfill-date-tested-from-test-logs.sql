-- Backfill valves.date_tested from the latest test_logs.tested_on when missing.
-- Safe to re-run. Does not change status or order_type.

update public.valves v
set
  date_tested = src.tested_on,
  updated_at = now()
from (
  select distinct on (valve_id)
    valve_id,
    tested_on
  from public.test_logs
  where tested_on is not null
    and nullif(btrim(valve_id), '') is not null
  order by valve_id, tested_on desc, created_at desc
) src
where v.valve_id = src.valve_id
  and v.date_tested is null;
