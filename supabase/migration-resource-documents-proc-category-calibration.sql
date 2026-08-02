-- Allow Calibration as a procedure category on resource_documents.
-- Safe to re-run.

alter table public.resource_documents
  drop constraint if exists resource_documents_proc_category_check;

alter table public.resource_documents
  add constraint resource_documents_proc_category_check
  check (
    proc_category is null
    or proc_category in (
      'Valve-Specific',
      'NDE',
      'Other',
      'Test',
      'Answer Key',
      'Calibration'
    )
  );
