-- Prevent Auth user deletes from wiping inbox history.
-- Also helps when an employee account is recreated: messages can be remapped.
--
-- 1) Stop CASCADE deletes on recipient/sender
-- 2) Helper to remap messages from an old auth user to a new one

alter table public.app_messages
  alter column recipient_user_id drop not null;

alter table public.app_messages
  drop constraint if exists app_messages_recipient_user_id_fkey;

alter table public.app_messages
  add constraint app_messages_recipient_user_id_fkey
  foreign key (recipient_user_id) references auth.users (id) on delete set null;

alter table public.app_messages
  drop constraint if exists app_messages_sender_user_id_fkey;

alter table public.app_messages
  add constraint app_messages_sender_user_id_fkey
  foreign key (sender_user_id) references auth.users (id) on delete set null;

-- Remap messages after an Auth user is recreated.
-- Example:
--   select public.remap_app_messages(
--     'OLD-UUID-HERE'::uuid,
--     'NEW-UUID-HERE'::uuid
--   );

create or replace function public.remap_app_messages(
  p_old_user_id uuid,
  p_new_user_id uuid
)
returns table(updated_as_recipient bigint, updated_as_sender bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient bigint := 0;
  v_sender bigint := 0;
begin
  if p_old_user_id is null or p_new_user_id is null then
    raise exception 'old and new user ids are required';
  end if;
  if p_old_user_id = p_new_user_id then
    raise exception 'old and new user ids must differ';
  end if;

  update public.app_messages
  set recipient_user_id = p_new_user_id
  where recipient_user_id = p_old_user_id;
  get diagnostics v_recipient = row_count;

  update public.app_messages
  set sender_user_id = p_new_user_id
  where sender_user_id = p_old_user_id;
  get diagnostics v_sender = row_count;

  return query select v_recipient, v_sender;
end;
$$;

revoke all on function public.remap_app_messages(uuid, uuid) from public;
grant execute on function public.remap_app_messages(uuid, uuid) to service_role;
