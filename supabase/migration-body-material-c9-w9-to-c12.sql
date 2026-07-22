-- Rename body material dropdown option C9 / W9 → C12

update public.lookup_values
set value = 'C12'
where category = 'body_material'
  and value in ('C9', 'W9');

-- Keep list unique if C12 already existed
delete from public.lookup_values a
using public.lookup_values b
where a.category = 'body_material'
  and b.category = 'body_material'
  and a.value = 'C12'
  and b.value = 'C12'
  and a.id > b.id;

insert into public.lookup_values (category, value, sort_order)
select 'body_material', 'C12', 6
where not exists (
  select 1 from public.lookup_values
  where category = 'body_material' and value = 'C12'
);

update public.valves
set body_material = 'C12'
where body_material in ('C9', 'W9');

update public.test_logs
set body_material = 'C12'
where body_material in ('C9', 'W9');
