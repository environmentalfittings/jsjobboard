-- Run once in Supabase SQL Editor.
-- Adds manufacturer and product_valve_type columns to resource_documents.
-- Also seeds the manufacturer lookup category so Manage Lists can manage it.

begin;

alter table public.resource_documents
  add column if not exists manufacturer text;

alter table public.resource_documents
  add column if not exists product_valve_type text;

-- Seed the manufacturer lookup category (add your own manufacturers via Manage Lists)
insert into public.lookup_values (category, value, sort_order)
values
  ('manufacturer', 'Cameron', 1),
  ('manufacturer', 'Flowserve', 2),
  ('manufacturer', 'Velan', 3),
  ('manufacturer', 'Emerson', 4),
  ('manufacturer', 'IMI CCI', 5),
  ('manufacturer', 'Neles', 6),
  ('manufacturer', 'Trunnion', 7),
  ('manufacturer', 'Other', 8)
on conflict do nothing;

commit;
