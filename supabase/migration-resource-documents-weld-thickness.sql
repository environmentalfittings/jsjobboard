-- Run once in Supabase SQL Editor.
-- Adds weld procedure thickness and PWHT fields to resource_documents.

begin;

alter table public.resource_documents
  add column if not exists base_metal_thickness_qualified text;

alter table public.resource_documents
  add column if not exists filler_metal_thickness_qualified text;

alter table public.resource_documents
  add column if not exists post_weld_heat_treat_required boolean not null default false;

alter table public.resource_documents
  add column if not exists weld_modes text[] not null default '{}';

alter table public.resource_documents
  add column if not exists pwht_temperature text;

alter table public.resource_documents
  add column if not exists pwht_time text;

alter table public.resource_documents
  add column if not exists hf_approved boolean not null default false;

commit;
