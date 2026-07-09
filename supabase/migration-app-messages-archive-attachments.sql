-- Archive, delete, and file attachments for employee messages.

alter table public.app_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists recipient_archived_at timestamptz,
  add column if not exists recipient_deleted_at timestamptz,
  add column if not exists sender_archived_at timestamptz,
  add column if not exists sender_deleted_at timestamptz;

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

drop policy if exists "messages_update_sender" on public.app_messages;
create policy "messages_update_sender"
on public.app_messages
for update
to authenticated
using (sender_user_id = auth.uid())
with check (sender_user_id = auth.uid());

revoke all on function public.archive_app_message(bigint) from public;
revoke all on function public.unarchive_app_message(bigint) from public;
revoke all on function public.delete_app_message(bigint) from public;
grant execute on function public.archive_app_message(bigint) to authenticated;
grant execute on function public.unarchive_app_message(bigint) to authenticated;
grant execute on function public.delete_app_message(bigint) to authenticated;
