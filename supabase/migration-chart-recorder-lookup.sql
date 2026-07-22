-- Chart recorder numbers for 4-hour shell tests.
-- Superseded: chart recorders are now test_gauges with gauge_type = 'Chart recorder'.
-- See migration-chart-recorders-to-test-gauges.sql

insert into public.lookup_values (category, value, sort_order) values
  ('chart_recorder', 'CR-1', 0),
  ('chart_recorder', 'CR-2', 1)
on conflict do nothing;
