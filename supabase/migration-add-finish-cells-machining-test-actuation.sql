-- Ensure finish cells exist for job dropdowns and daily priority filters.
-- Run in Supabase SQL Editor.

insert into public.lookup_values (category, value, sort_order)
values
  ('finish_cell', 'Actuation', 0),
  ('finish_cell', 'Machining only', 6),
  ('finish_cell', 'Test Only', 9)
on conflict (category, value) do update
set sort_order = excluded.sort_order;
