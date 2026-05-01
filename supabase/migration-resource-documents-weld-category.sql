-- Run once in Supabase SQL Editor.
-- Adds base_metal_category column to resource_documents for weld procedure P-number classification.

begin;

alter table public.resource_documents
  add column if not exists base_metal_category text
    check (base_metal_category in (
      'Carbon/P1',
      'P4/F11',
      'P4A/F22',
      'P5/C5',
      'P5B/C12',
      'P15E/F91',
      'P8/300 Series Stainless',
      'P6/400 Series Stainless',
      'Other'
    ));

commit;
