-- Allow MTRs in Resources (valves, filler metals, and material).
-- Run once in Supabase SQL Editor.

begin;

alter table public.resource_documents
  drop constraint if exists resource_documents_category_check;

alter table public.resource_documents
  add constraint resource_documents_category_check
  check (
    category in (
      'general',
      'weld_procedure',
      'quality_control',
      'iom',
      'maintenance_manual',
      'other',
      'employee_training',
      'relief_valve_spec_book',
      'mtr'
    )
  );

alter table public.resource_documents
  add column if not exists mtr_kind text;

alter table public.resource_documents
  add column if not exists heat_lot text;

alter table public.resource_documents
  drop constraint if exists resource_documents_mtr_kind_check;

alter table public.resource_documents
  add constraint resource_documents_mtr_kind_check
  check (
    mtr_kind is null
    or mtr_kind in ('valve', 'filler_metal', 'material')
  );

create index if not exists idx_resource_documents_mtr_kind
  on public.resource_documents (category, mtr_kind, updated_at desc, id desc)
  where category = 'mtr';

comment on column public.resource_documents.mtr_kind is
  'MTR use: valve, filler_metal, or material. Null for other resource categories.';

comment on column public.resource_documents.heat_lot is
  'Heat, heat lot, or mill lot number from the MTR.';

commit;
