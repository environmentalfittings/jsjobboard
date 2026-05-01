-- Run once in Supabase SQL Editor.
-- Adds body_material column to the valves table and seeds lookup values.

begin;

alter table public.valves
  add column if not exists body_material text;

insert into public.lookup_values (category, value, sort_order)
values
  ('body_material', 'WCB',       1),
  ('body_material', 'WC1',       2),
  ('body_material', 'F11',       3),
  ('body_material', 'F22',       4),
  ('body_material', 'C5',        5),
  ('body_material', 'C9',        6),
  ('body_material', 'P91',       7),
  ('body_material', '304 SS',    8),
  ('body_material', '309 SS',    9),
  ('body_material', '316 SS',    10),
  ('body_material', '347 SS',    11),
  ('body_material', 'Monel',     12),
  ('body_material', 'Hastelloy', 13)
on conflict (category, value) do nothing;

commit;
