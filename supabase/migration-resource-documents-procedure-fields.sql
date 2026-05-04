-- Run in Supabase SQL Editor.
-- Adds procedure-specific metadata columns to resource_documents.

alter table public.resource_documents
  add column if not exists sop_number      text,
  add column if not exists revision_number text,
  add column if not exists date_updated    date,
  add column if not exists proc_category   text;

alter table public.resource_documents
  drop constraint if exists resource_documents_proc_category_check;

alter table public.resource_documents
  add constraint resource_documents_proc_category_check
  check (proc_category in ('Valve-Specific', 'NDE', 'Other', 'Test', 'Answer Key'));
