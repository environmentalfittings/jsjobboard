-- Customer inventory: part_type for valve parts + seed Part Type lookup values.
-- Safe to re-run.

alter table public.inventory
  add column if not exists part_type text;

comment on column public.inventory.part_type is
  'Part type when is_valve_part is true (e.g. Plug, Kit, Ball). Null for complete valves.';

insert into public.lookup_values (category, value, sort_order)
values
  ('inventory_part_type', 'Plug', 10),
  ('inventory_part_type', 'Kit', 20),
  ('inventory_part_type', 'Ball', 30),
  ('inventory_part_type', 'Bellows', 40),
  ('inventory_part_type', 'Sleeve', 50)
on conflict (category, value) do nothing;
