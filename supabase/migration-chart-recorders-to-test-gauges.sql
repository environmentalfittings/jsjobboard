-- Move chart recorder lookup values into the calibrated test_gauges registry.
-- Chart recorders are managed under Admin → Manage lists → Test gauges (type: Chart recorder).

insert into public.test_gauges (gauge_type, gauge_number, active)
select
  'Chart recorder',
  lv.value,
  true
from public.lookup_values lv
where lv.category = 'chart_recorder'
  and nullif(trim(lv.value), '') is not null
  and not exists (
    select 1
    from public.test_gauges tg
    where tg.gauge_number = lv.value
  );

delete from public.lookup_values
where category = 'chart_recorder';
