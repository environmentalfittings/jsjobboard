-- 5S rail fields on shop to-do (daily_notes).
-- Run once in Supabase SQL Editor (after migration-daily-notes.sql).

begin;

alter table public.daily_notes
  add column if not exists estimated_completion_date date;

alter table public.daily_notes
  add column if not exists add_to_rail boolean not null default false;

alter table public.daily_notes
  add column if not exists created_by text;

alter table public.daily_notes
  add column if not exists rail_added_by text;

create index if not exists idx_daily_notes_rail
  on public.daily_notes (add_to_rail, estimated_completion_date)
  where add_to_rail = true;

commit;
