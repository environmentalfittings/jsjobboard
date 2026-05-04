-- Optional starter data for ASME B16.10 face-to-face references.
-- Safe to run multiple times.

insert into public.b1610_face_to_face_refs (
  valve_type,
  nps,
  pressure_class,
  end_connection,
  standard_dimension,
  tolerance,
  source
)
values
  ('Plug', '2',  '150', 'ANY',  8.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '3',  '150', 'ANY',  9.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '4',  '150', 'ANY', 11.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '6',  '150', 'ANY', 14.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '8',  '150', 'ANY', 17.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '10', '150', 'ANY', 19.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '12', '150', 'ANY', 22.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '2',  '300', 'ANY',  8.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '3',  '300', 'ANY', 10.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '4',  '300', 'ANY', 12.5000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '6',  '300', 'ANY', 15.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '8',  '300', 'ANY', 18.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '10', '300', 'ANY', 21.0000, 0.0625, 'Bundled B16.10 defaults'),
  ('Plug', '12', '300', 'ANY', 24.0000, 0.0625, 'Bundled B16.10 defaults')
on conflict (valve_type, nps, pressure_class, end_connection)
do update set
  standard_dimension = excluded.standard_dimension,
  tolerance = excluded.tolerance,
  source = excluded.source,
  updated_at = now();
