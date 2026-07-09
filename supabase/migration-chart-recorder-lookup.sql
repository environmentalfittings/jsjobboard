-- Chart recorder numbers for 4-hour shell tests (Admin → Manage lists → Chart recorders).
-- Add your recorder IDs here or through the admin UI after running this migration.
insert into public.lookup_values (category, value, sort_order) values
  ('chart_recorder', 'CR-1', 0),
  ('chart_recorder', 'CR-2', 1)
on conflict (category, value) do nothing;
