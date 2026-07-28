-- Find completed jobs inflating "this month" on the dashboard (July spike).
-- Dashboard uses the earlier of date_tested and date_closed for metrics.

select
  count(*) filter (
    where order_type = 'Completed'
      and status = 'Completed'
      and date_closed >= date_trunc('month', current_date)::date
  ) as closed_date_this_month,
  count(*) filter (
    where order_type = 'Completed'
      and status = 'Completed'
      and least(
        coalesce(date_closed, '9999-12-31'::date),
        coalesce(date_tested, '9999-12-31'::date)
      ) >= date_trunc('month', current_date)::date
      and least(
        coalesce(date_closed, '9999-12-31'::date),
        coalesce(date_tested, '9999-12-31'::date)
      ) < (date_trunc('month', current_date) + interval '1 month')::date
  ) as metrics_month_count,
  count(*) filter (
    where order_type = 'Completed'
      and status = 'Completed'
      and date_closed >= date_trunc('month', current_date)::date
      and date_tested is not null
      and date_tested < date_trunc('month', current_date)::date
  ) as close_stamp_this_month_but_tested_earlier
from public.valves;

-- Optional repair: align date_closed with date_tested when close was stamped later in bulk.
-- Preview first:
select valve_id, customer, status, date_tested, date_closed
from public.valves
where order_type = 'Completed'
  and status = 'Completed'
  and date_tested is not null
  and date_closed is not null
  and date_closed > date_tested
  and date_closed >= date_trunc('month', current_date)::date
order by date_tested
limit 50;

-- Uncomment to apply (sets close date to test date when test is earlier):
-- update public.valves
-- set date_closed = date_tested,
--     updated_at = now()
-- where order_type = 'Completed'
--   and status = 'Completed'
--   and date_tested is not null
--   and date_closed is not null
--   and date_closed > date_tested
--   and date_closed >= date_trunc('month', current_date)::date;
