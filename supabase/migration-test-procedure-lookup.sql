-- Default test requirement options for test log (Admin → Manage lists → Test requirements).
insert into public.lookup_values (category, value, sort_order) values
  ('test_procedure', 'API 598 Test', 0),
  ('test_procedure', 'API 6D Test', 1),
  ('test_procedure', 'MSS SP 160 Test', 2),
  ('test_procedure', '4-Hour Chart Test', 3),
  ('test_procedure', 'Helium Test', 4)
on conflict (category, value) do nothing;
