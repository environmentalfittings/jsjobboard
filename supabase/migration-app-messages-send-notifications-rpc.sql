-- Reliable Quality Team / ITP notification inserts (bypasses restrictive RLS).
-- Allows authenticated users to insert ITP notification kinds, including a
-- self-notification when the flagger is on the Quality Team.
-- Run in a NEW blank Supabase SQL query. Safe to re-run.

-- 1) Policy: any signed-in user can insert specific notification kinds
drop policy if exists "messages_insert_notification_authenticated" on public.app_messages;
create policy "messages_insert_notification_authenticated"
on public.app_messages
for insert
to authenticated
with check (
  category = 'notification'
  and sender_user_id = auth.uid()
  and recipient_user_id is not null
  and notification_kind in (
    'itp_item_flagged',
    'itp_qc_review_requested',
    'itp_flag_resolved',
    'feedback_resolved'
  )
);

-- 2) RPC: insert many notification rows as the current user (security definer)
create or replace function public.send_app_notifications(
  p_recipient_user_ids uuid[],
  p_subject text,
  p_body text,
  p_notification_kind text,
  p_sender_name text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_count integer := 0;
  v_recipient uuid;
begin
  if v_sender is null then
    raise exception 'Not authenticated';
  end if;

  if p_notification_kind is null or length(trim(p_notification_kind)) = 0 then
    raise exception 'notification_kind is required';
  end if;

  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'body is required';
  end if;

  if p_recipient_user_ids is null or array_length(p_recipient_user_ids, 1) is null then
    return 0;
  end if;

  foreach v_recipient in array p_recipient_user_ids
  loop
    if v_recipient is null then
      continue;
    end if;

    insert into public.app_messages (
      sender_user_id,
      recipient_user_id,
      sender_name,
      subject,
      body,
      category,
      notification_kind,
      related_feedback_id,
      metadata
    ) values (
      v_sender,
      v_recipient,
      nullif(trim(coalesce(p_sender_name, '')), ''),
      nullif(trim(coalesce(p_subject, '')), ''),
      trim(p_body),
      'notification',
      trim(p_notification_kind),
      null,
      coalesce(p_metadata, '{}'::jsonb)
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_app_notifications(uuid[], text, text, text, text, jsonb) from public;
grant execute on function public.send_app_notifications(uuid[], text, text, text, text, jsonb) to authenticated;
