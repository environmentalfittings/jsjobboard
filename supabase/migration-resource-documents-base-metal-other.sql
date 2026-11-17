-- When Base Metal Category is Other, store the required description.

begin;

alter table public.resource_documents
  add column if not exists base_metal_other text;

commit;
