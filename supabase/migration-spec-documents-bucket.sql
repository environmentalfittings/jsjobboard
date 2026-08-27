-- Private Storage bucket for Relief Valve Spec Books / reference PDFs.
-- Read: any authenticated user. Write: shop admin OR quality admin/manager
-- (public.can_write_spec_data() from migration-spec-phase1-prv-specs.sql).
--
-- Run in Supabase SQL Editor after Phase 1 PRV specs migration.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'spec-documents',
  'spec-documents',
  false,
  41943040,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "spec_documents_storage_select" on storage.objects;
create policy "spec_documents_storage_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'spec-documents');

drop policy if exists "spec_documents_storage_insert" on storage.objects;
create policy "spec_documents_storage_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'spec-documents'
  and public.can_write_spec_data()
);

drop policy if exists "spec_documents_storage_update" on storage.objects;
create policy "spec_documents_storage_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'spec-documents'
  and public.can_write_spec_data()
)
with check (
  bucket_id = 'spec-documents'
  and public.can_write_spec_data()
);

drop policy if exists "spec_documents_storage_delete" on storage.objects;
create policy "spec_documents_storage_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'spec-documents'
  and public.can_write_spec_data()
);

commit;
