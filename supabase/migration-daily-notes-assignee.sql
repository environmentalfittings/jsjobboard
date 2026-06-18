-- Add optional assignee to shop daily notes.
-- Run once in Supabase SQL Editor (after migration-daily-notes.sql).

begin;

alter table public.daily_notes
  add column if not exists assigned_to text;

commit;
