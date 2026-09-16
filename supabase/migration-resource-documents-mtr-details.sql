-- Extra MTR detail fields for valve, filler metal, and material reports.
-- Run once in Supabase SQL Editor after migration-resource-documents-mtr-numbers.sql.

begin;

alter table public.resource_documents
  add column if not exists mtr_size text;

alter table public.resource_documents
  add column if not exists mtr_pressure text;

alter table public.resource_documents
  add column if not exists mtr_body_heat text;

alter table public.resource_documents
  add column if not exists mtr_bonnet_heat text;

alter table public.resource_documents
  add column if not exists mtr_material text;

alter table public.resource_documents
  add column if not exists mtr_length text;

alter table public.resource_documents
  add column if not exists mtr_od text;

alter table public.resource_documents
  add column if not exists mtr_inside_dia text;

comment on column public.resource_documents.mtr_size is
  'Valve NPS or filler rod/wire diameter, depending on mtr_kind.';
comment on column public.resource_documents.mtr_pressure is
  'Valve pressure class for valve MTRs.';
comment on column public.resource_documents.mtr_body_heat is
  'Valve body heat number.';
comment on column public.resource_documents.mtr_bonnet_heat is
  'Valve bonnet heat number.';
comment on column public.resource_documents.mtr_material is
  'Material grade/spec for material MTRs, or filler base material.';
comment on column public.resource_documents.mtr_length is
  'Stock length for material MTRs.';
comment on column public.resource_documents.mtr_od is
  'Outside diameter for material MTRs.';
comment on column public.resource_documents.mtr_inside_dia is
  'Inside diameter for material MTRs.';

commit;
