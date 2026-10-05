-- Shop to-do list (daily_notes) per company.
-- Existing rows with no organization_id stay on JS Valve.
-- Run once in the Supabase SQL Editor.

alter table public.daily_notes
  add column if not exists organization_id uuid references public.organizations(id);

create index if not exists idx_daily_notes_organization
  on public.daily_notes (organization_id, is_done, note_date desc);
