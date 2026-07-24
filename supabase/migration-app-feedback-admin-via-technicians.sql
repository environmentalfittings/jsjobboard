-- Fix feedback inbox visibility for shop Admins (technicians.role = admin)
-- and allow submitters to attach screenshots on their own open feedback.
-- Run in Supabase SQL Editor.

-- 1) Admin read: JWT role, profiles.role, OR technicians.role
drop policy if exists "feedback_admin_read" on public.app_feedback;
create policy "feedback_admin_read"
on public.app_feedback
for select
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
);

-- 2) Admin update (resolve / notes / images)
drop policy if exists "feedback_admin_update" on public.app_feedback;
create policy "feedback_admin_update"
on public.app_feedback
for update
to authenticated
using (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
)
with check (
  coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
  or exists (
    select 1 from public.technicians t
    where t.user_id = auth.uid() and lower(coalesce(t.role, '')) = 'admin'
  )
);

-- 3) Submitters can read their own rows (needed for insert … returning)
drop policy if exists "feedback_submitter_read" on public.app_feedback;
create policy "feedback_submitter_read"
on public.app_feedback
for select
to authenticated
using (submitted_by_user_id = auth.uid());

-- 4) Submitters can update screenshots on their own open feedback
drop policy if exists "feedback_submitter_update_images" on public.app_feedback;
create policy "feedback_submitter_update_images"
on public.app_feedback
for update
to authenticated
using (
  submitted_by_user_id = auth.uid()
  and status = 'open'
)
with check (
  submitted_by_user_id = auth.uid()
  and status = 'open'
);

-- Quick check: does Gary's feedback exist? (bypasses app RLS)
-- select id, user_name, user_role, status, created_at, left(message, 120)
-- from public.app_feedback
-- where created_at >= current_date
--    or user_name ilike '%gary%'
--    or user_name ilike '%hensley%'
-- order by created_at desc;
