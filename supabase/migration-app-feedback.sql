-- User feedback during development / beta testing.

create table if not exists public.app_feedback (
  id bigserial primary key,
  message text not null check (char_length(trim(message)) > 0),
  page_url text,
  user_name text,
  user_role text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  resolution_images jsonb not null default '[]'::jsonb,
  submission_images jsonb not null default '[]'::jsonb,
  submitted_by_user_id uuid references auth.users (id) on delete set null,
  submitter_seen_at timestamptz,
  resolution_notified_at timestamptz
);

create index if not exists idx_app_feedback_status_created
  on public.app_feedback (status, created_at desc);

alter table public.app_feedback enable row level security;

drop policy if exists "feedback_insert_authenticated" on public.app_feedback;
create policy "feedback_insert_authenticated"
on public.app_feedback
for insert
to authenticated
with check (true);

drop policy if exists "feedback_insert_anon" on public.app_feedback;
create policy "feedback_insert_anon"
on public.app_feedback
for insert
to anon
with check (true);

drop policy if exists "feedback_admin_read" on public.app_feedback;
create policy "feedback_admin_read"
on public.app_feedback
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

drop policy if exists "feedback_admin_update" on public.app_feedback;
create policy "feedback_admin_update"
on public.app_feedback
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);
