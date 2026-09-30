-- Company calendar events (posted notes / meetings / shop events).
-- Run in Supabase → SQL Editor. Safe to re-run.

begin;

create table if not exists public.company_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_key text not null default 'js-valve',
  organization_id uuid references public.organizations (id) on delete set null,
  event_date date not null,
  end_date date,
  title text not null check (char_length(trim(title)) > 0),
  details text not null default '',
  all_day boolean not null default true,
  created_by_name text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_calendar_events_company_date
  on public.company_calendar_events (company_key, event_date);

create index if not exists idx_company_calendar_events_org_date
  on public.company_calendar_events (organization_id, event_date);

alter table public.company_calendar_events enable row level security;

drop policy if exists "calendar events read" on public.company_calendar_events;
create policy "calendar events read"
on public.company_calendar_events
for select
using (true);

drop policy if exists "calendar events insert authenticated" on public.company_calendar_events;
create policy "calendar events insert authenticated"
on public.company_calendar_events
for insert
to authenticated
with check (true);

drop policy if exists "calendar events update authenticated" on public.company_calendar_events;
create policy "calendar events update authenticated"
on public.company_calendar_events
for update
to authenticated
using (true)
with check (true);

drop policy if exists "calendar events delete authenticated" on public.company_calendar_events;
create policy "calendar events delete authenticated"
on public.company_calendar_events
for delete
to authenticated
using (true);

-- Allow Superadmin / local login (anon) to manage events the same way as other shop tables.
drop policy if exists "calendar events insert anon" on public.company_calendar_events;
create policy "calendar events insert anon"
on public.company_calendar_events
for insert
to anon
with check (true);

drop policy if exists "calendar events update anon" on public.company_calendar_events;
create policy "calendar events update anon"
on public.company_calendar_events
for update
to anon
using (true)
with check (true);

drop policy if exists "calendar events delete anon" on public.company_calendar_events;
create policy "calendar events delete anon"
on public.company_calendar_events
for delete
to anon
using (true);

commit;
