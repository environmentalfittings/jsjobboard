-- Run once in Supabase SQL Editor.
-- Creates the valve-attachments storage bucket and storage policies
-- used by the Resources page document upload feature.

begin;

-- Create the bucket if it does not exist yet.
-- public = false means files are not world-readable via a bare URL;
-- they are served through Supabase's signed/public URL helpers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'valve-attachments',
  'valve-attachments',
  true,            -- public so resourceDocumentPublicUrl() works without signing
  41943040,        -- 40 MB limit matches the app's MAX_BYTES check
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
on conflict (id) do nothing;

-- Storage object policies (storage.objects table):

-- Allow authenticated users to upload files to this bucket.
drop policy if exists "valve_attachments_insert" on storage.objects;
create policy "valve_attachments_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'valve-attachments');

-- Allow anyone (anon + authenticated) to read/download files (bucket is public).
drop policy if exists "valve_attachments_select" on storage.objects;
create policy "valve_attachments_select"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'valve-attachments');

-- Allow authenticated users to delete files (admin removes documents).
drop policy if exists "valve_attachments_delete" on storage.objects;
create policy "valve_attachments_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'valve-attachments');

commit;
