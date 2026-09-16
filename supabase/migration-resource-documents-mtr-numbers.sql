-- MTR numbers for Resources mill test reports.
-- Run once in Supabase SQL Editor after migration-resource-documents-mtrs.sql.

begin;

alter table public.resource_documents
  add column if not exists mtr_number text;

create unique index if not exists uq_resource_documents_mtr_number
  on public.resource_documents (lower(trim(mtr_number)))
  where category = 'mtr' and mtr_number is not null and length(trim(mtr_number)) > 0;

create index if not exists idx_resource_documents_mtr_number
  on public.resource_documents (mtr_number)
  where category = 'mtr';

comment on column public.resource_documents.mtr_number is
  'Shop MTR number. Existing reports can keep their assigned number; new reports auto-assign MTR-000001+.';

commit;
