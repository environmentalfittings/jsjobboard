-- Fix shop status on valves that are already closed by order type.
-- Problem: many rows have order_type = 'Completed' but status left on
-- Teardown / Assembly / Fitting / etc. (often from spreadsheet import / Jul 6 bulk update).
-- Safe: only touches Completed order-type rows whose status is NOT already a done status.

-- 1) Preview (run first)
select
  status,
  count(*) as qty
from public.valves
where order_type = 'Completed'
  and coalesce(status, '') not in ('Completed', 'Warehouse RTS', 'Junked', 'Replaced')
group by status
order by qty desc;

-- 2) Apply fix
update public.valves
set
  status = 'Completed',
  date_closed = coalesce(date_closed, date_tested),
  updated_at = now()
where order_type = 'Completed'
  and coalesce(status, '') not in ('Completed', 'Warehouse RTS', 'Junked', 'Replaced');

-- 3) Confirm Citgo examples
select valve_id, customer, status, order_type, date_closed
from public.valves
where valve_id in ('492343-1', '492343-2')
   or customer ilike '%citgo%'
order by valve_id
limit 50;
