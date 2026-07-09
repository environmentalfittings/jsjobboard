-- Default test media options for test log entry dropdowns (Admin → Manage lists → Test media).
insert into public.lookup_values (category, value, sort_order) values
  ('test_media', 'Air', 0),
  ('test_media', 'Water', 1),
  ('test_media', 'Methane', 2),
  ('test_media', 'Helium', 3),
  ('test_media', 'Mineral Oil', 4),
  ('test_media', 'Diesel', 5)
on conflict (category, value) do nothing;
