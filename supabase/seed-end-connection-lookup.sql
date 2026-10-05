-- Outlet / end connection and pipe schedule lists for traveler dropdowns.
-- Safe to re-run: on conflict (category, value) do nothing.

insert into public.lookup_values (category, value, sort_order) values
  ('end_connection', 'RF', 0),
  ('end_connection', 'RTJ', 1),
  ('end_connection', 'SW', 2),
  ('end_connection', 'THR', 3),
  ('end_connection', 'SW/THR', 4),
  ('end_connection', 'BWE', 5),
  ('pipe_schedule', '5', 0),
  ('pipe_schedule', '10', 1),
  ('pipe_schedule', '20', 2),
  ('pipe_schedule', '30', 3),
  ('pipe_schedule', '40', 4),
  ('pipe_schedule', '60', 5),
  ('pipe_schedule', '80', 6),
  ('pipe_schedule', '100', 7),
  ('pipe_schedule', '120', 8),
  ('pipe_schedule', '140', 9),
  ('pipe_schedule', '160', 10),
  ('pipe_schedule', 'STD', 11),
  ('pipe_schedule', 'XS', 12),
  ('pipe_schedule', 'XXS', 13),
  ('pipe_schedule', '5S', 14),
  ('pipe_schedule', '10S', 15),
  ('pipe_schedule', '40S', 16),
  ('pipe_schedule', '80S', 17)
on conflict (category, value) do nothing;
