-- Link feedback to submitter and track when they've seen the resolution.

alter table public.app_feedback
  add column if not exists submitted_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists submitter_seen_at timestamptz;

create index if not exists idx_app_feedback_submitter_unseen
  on public.app_feedback (submitted_by_user_id, status)
  where submitter_seen_at is null;

drop policy if exists "feedback_submitter_read" on public.app_feedback;
create policy "feedback_submitter_read"
on public.app_feedback
for select
to authenticated
using (submitted_by_user_id = auth.uid());

create or replace function public.mark_feedback_resolution_seen(p_feedback_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_feedback
  set submitter_seen_at = now()
  where id = p_feedback_id
    and submitted_by_user_id = auth.uid()
    and status = 'resolved'
    and submitter_seen_at is null;
end;
$$;

revoke all on function public.mark_feedback_resolution_seen(bigint) from public;
grant execute on function public.mark_feedback_resolution_seen(bigint) to authenticated;
