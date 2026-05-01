-- Run once in Supabase SQL Editor.
-- Adds weld-procedure-specific fields to resource_documents.

begin;

-- WPS Type: Joint | Corrosion Resistant Overlay | Hardface Overlay
alter table public.resource_documents
  add column if not exists wps_type text
  check (wps_type is null or wps_type in ('Joint', 'Corrosion Resistant Overlay', 'Hardface Overlay'));

-- Weld processes used (multi-select stored as text array)
alter table public.resource_documents
  add column if not exists weld_processes text[] default '{}';

-- Filler metal designation (free text)
alter table public.resource_documents
  add column if not exists filler_metal text;

commit;
