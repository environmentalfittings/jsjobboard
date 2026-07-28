-- Diagnose Mike Dunn (or any user) empty Messages / missing archives.
-- Run in Supabase SQL Editor (bypasses RLS).

-- 1) Mike's linked Auth IDs
select
  'employee' as source,
  e.id::text as row_id,
  e.full_name as name,
  e.username as login_username,
  e.auth_user_id::text as auth_user_id,
  e.quality_team_level
from public.employees e
where lower(coalesce(e.username, '')) in ('mdunn', 'mike.dunn')
   or lower(coalesce(e.full_name, '')) like '%dunn%'

union all

select
  'technician' as source,
  t.id::text as row_id,
  t.name,
  t.login_username,
  t.user_id::text as auth_user_id,
  t.role
from public.technicians t
where lower(coalesce(t.login_username, '')) in ('mdunn', 'mike.dunn')
   or lower(coalesce(t.name, '')) like '%dunn%';

-- 2) Auth users that look like Mike
select id, email, created_at, last_sign_in_at
from auth.users
where lower(email) like '%dunn%'
   or lower(email) like '%mdunn%'
order by created_at desc;

-- 3) Total messages in table
select count(*) as total_messages from public.app_messages;

-- 4) Messages for Mike's current employee auth_user_id
select
  count(*) as message_count,
  count(*) filter (where recipient_archived_at is not null) as recipient_archived,
  count(*) filter (where sender_archived_at is not null) as sender_archived,
  count(*) filter (where category = 'notification') as notifications,
  count(*) filter (where notification_kind like 'itp_%') as itp_notifications
from public.app_messages m
join public.employees e on e.auth_user_id = m.recipient_user_id or e.auth_user_id = m.sender_user_id
where lower(coalesce(e.username, '')) in ('mdunn', 'mike.dunn')
   or lower(coalesce(e.full_name, '')) like '%dunn%';

-- 5) Confirm FK: deleting auth users still cascades-deletes recipient mail?
select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.app_messages'::regclass
  and contype = 'f'
  and conname like '%recipient%';

-- 6) Confirm notification RPC exists
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'send_app_notifications';
