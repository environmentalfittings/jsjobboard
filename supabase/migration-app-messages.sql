-- In-app messages and notifications between employees.

create table if not exists public.app_messages (
  id bigserial primary key,
  sender_user_id uuid references auth.users (id) on delete set null,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  sender_name text,
  subject text,
  body text not null check (char_length(trim(body)) > 0),
  category text not null default 'message' check (category in ('message', 'notification')),
  notification_kind text,
  related_feedback_id bigint references public.app_feedback (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  attachments jsonb not null default '[]'::jsonb,
  recipient_archived_at timestamptz,
  recipient_deleted_at timestamptz,
  sender_archived_at timestamptz,
  sender_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (category = 'notification' or sender_user_id is not null)
);

create index if not exists idx_app_messages_recipient_created
  on public.app_messages (recipient_user_id, created_at desc);

create index if not exists idx_app_messages_sender_created
  on public.app_messages (sender_user_id, created_at desc);

create index if not exists idx_app_messages_recipient_unread
  on public.app_messages (recipient_user_id)
  where read_at is null;

alter table public.app_messages enable row level security;

drop policy if exists "messages_select_participant" on public.app_messages;
create policy "messages_select_participant"
on public.app_messages
for select
to authenticated
using (recipient_user_id = auth.uid() or sender_user_id = auth.uid());

drop policy if exists "messages_insert_direct" on public.app_messages;
create policy "messages_insert_direct"
on public.app_messages
for insert
to authenticated
with check (
  category = 'message'
  and sender_user_id = auth.uid()
  and recipient_user_id <> auth.uid()
);

drop policy if exists "messages_insert_notification_admin" on public.app_messages;
create policy "messages_insert_notification_admin"
on public.app_messages
for insert
to authenticated
with check (
  category = 'notification'
  and (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  )
);

create or replace function public.mark_app_message_read(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_messages
  set read_at = now()
  where id = p_message_id
    and recipient_user_id = auth.uid()
    and read_at is null;
end;
$$;

drop policy if exists "messages_update_sender" on public.app_messages;
create policy "messages_update_sender"
on public.app_messages
for update
to authenticated
using (sender_user_id = auth.uid())
with check (sender_user_id = auth.uid());

create or replace function public.archive_app_message(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_messages
  set recipient_archived_at = coalesce(recipient_archived_at, now())
  where id = p_message_id
    and recipient_user_id = auth.uid()
    and recipient_deleted_at is null;

  update public.app_messages
  set sender_archived_at = coalesce(sender_archived_at, now())
  where id = p_message_id
    and sender_user_id = auth.uid()
    and sender_deleted_at is null;
end;
$$;

create or replace function public.unarchive_app_message(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_messages
  set recipient_archived_at = null
  where id = p_message_id
    and recipient_user_id = auth.uid();

  update public.app_messages
  set sender_archived_at = null
  where id = p_message_id
    and sender_user_id = auth.uid();
end;
$$;

create or replace function public.delete_app_message(p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_messages
  set recipient_deleted_at = coalesce(recipient_deleted_at, now())
  where id = p_message_id
    and recipient_user_id = auth.uid();

  update public.app_messages
  set sender_deleted_at = coalesce(sender_deleted_at, now())
  where id = p_message_id
    and sender_user_id = auth.uid();
end;
$$;

revoke all on function public.mark_app_message_read(bigint) from public;
grant execute on function public.mark_app_message_read(bigint) to authenticated;
revoke all on function public.archive_app_message(bigint) from public;
revoke all on function public.unarchive_app_message(bigint) from public;
revoke all on function public.delete_app_message(bigint) from public;
grant execute on function public.archive_app_message(bigint) to authenticated;
grant execute on function public.unarchive_app_message(bigint) to authenticated;
grant execute on function public.delete_app_message(bigint) to authenticated;
