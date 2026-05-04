-- Run in Supabase SQL Editor.
-- Resets sort_order for all manufacturers to alphabetical order.

with ranked as (
  select id,
         row_number() over (order by lower(value)) as rn
  from public.lookup_values
  where category = 'manufacturer'
)
update public.lookup_values
set sort_order = ranked.rn
from ranked
where public.lookup_values.id = ranked.id;
