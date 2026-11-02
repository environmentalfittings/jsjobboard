-- Due date change: structured reason, comments, customer notification / response.
-- Run once in Supabase SQL Editor after migration-due-date-changes.sql.

begin;

alter table public.due_date_changes
  add column if not exists reason_code text,
  add column if not exists other_text text,
  add column if not exists comments text,
  add column if not exists customer_notification_at timestamptz,
  add column if not exists customer_response text,
  add column if not exists customer_response_comment text,
  add column if not exists customer_response_at timestamptz,
  add column if not exists customer_response_by_name text;

comment on column public.due_date_changes.reason_code is
  'Dropdown reason: Due date unrealistic | Waiting on parts | Postponed due to outside repair vendor | Rework was required | Other';
comment on column public.due_date_changes.other_text is
  'Required when reason_code = Other — what Other means';
comment on column public.due_date_changes.comments is
  'Technician comments (required for every due date change reason)';
comment on column public.due_date_changes.customer_notification_at is
  'When the customer was notified of the due date change';
comment on column public.due_date_changes.customer_response is
  'Approved | Cancelled | Other — clears the dashboard pending list';
comment on column public.due_date_changes.customer_response_comment is
  'Comment entered with the customer response';
comment on column public.due_date_changes.customer_response_at is
  'When the customer response was recorded';

create index if not exists idx_due_date_changes_pending_customer
  on public.due_date_changes (changed_at desc)
  where customer_response is null;

drop policy if exists "public update due date changes" on public.due_date_changes;
create policy "public update due date changes"
on public.due_date_changes
for update
to anon, authenticated
using (true)
with check (true);

grant select, insert, update, delete on table public.due_date_changes to anon, authenticated, service_role;

commit;
