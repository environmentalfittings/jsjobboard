-- Diagnose why Gary Hensley (or any user) sees no Messages.
-- Run in Supabase SQL Editor as postgres / service role.

-- 1) Gary's linked Auth IDs
select
  'technician' as source,
  t.id::text as row_id,
  t.name,
  t.login_username,
  t.login_email,
  t.user_id::text as auth_user_id,
  t.role
from public.technicians t
where lower(coalesce(t.login_username, '')) = 'ghensley'
   or lower(coalesce(t.name, '')) like '%hensley%'

union all

select
  'employee' as source,
  e.id::text as row_id,
  e.full_name as name,
  e.username as login_username,
  null as login_email,
  e.auth_user_id::text as auth_user_id,
  null as role
from public.employees e
where lower(coalesce(e.username, '')) = 'ghensley'
   or lower(coalesce(e.full_name, '')) like '%hensley%';

-- 2) Auth users that look like Gary
select id, email, created_at, last_sign_in_at
from auth.users
where lower(email) like '%hensley%'
   or lower(email) like '%ghensley%'
order by created_at desc;

-- 3) Total messages in table (bypasses RLS in SQL editor)
select count(*) as total_messages from public.app_messages;

-- 4) Messages for Gary's current technician user_id
select count(*) as messages_for_current_gary
from public.app_messages m
join public.technicians t on t.user_id = m.recipient_user_id or t.user_id = m.sender_user_id
where lower(coalesce(t.login_username, '')) = 'ghensley';

-- 5) Top recipients (who actually has mail)
select
  m.recipient_user_id,
  u.email,
  count(*) as message_count
from public.app_messages m
left join auth.users u on u.id = m.recipient_user_id
group by m.recipient_user_id, u.email
order by message_count desc
limit 20;
