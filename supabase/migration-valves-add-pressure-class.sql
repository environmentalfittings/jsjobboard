-- Run once in Supabase SQL Editor.
-- Adds pressure_class column to the valves table.

begin;

alter table public.valves
  add column if not exists pressure_class text;

-- Seed the pressure_class lookup list (ANSI/ASME + API classes).
-- AdminListsPage → Manage lists will let you add/remove values from here.
insert into public.lookup_values (category, value, sort_order)
values
  ('pressure_class', '150',   1),
  ('pressure_class', '300',   2),
  ('pressure_class', '400',   3),
  ('pressure_class', '600',   4),
  ('pressure_class', '800',   5),
  ('pressure_class', '900',   6),
  ('pressure_class', '1500',  7),
  ('pressure_class', '2500',  8),
  ('pressure_class', '3000',  9),
  ('pressure_class', '5000',  10),
  ('pressure_class', '10000', 11)
on conflict (category, value) do nothing;

commit;
