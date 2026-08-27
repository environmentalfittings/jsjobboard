-- Allow Relief Valve Spec Books in Resources.
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
      'relief_valve_spec_book'
    )
  );

commit;
