-- Diagnose shop login for a username (run in Supabase SQL Editor).
-- Replace jfuller if checking someone else.

select
  t.id,
  t.name,
  t.login_username,
  t.login_email,
  t.user_id,
  t.role,
  t.active,
  u.email as linked_auth_email,
  u.email_confirmed_at,
  u.raw_user_meta_data ->> 'role' as auth_role
from public.technicians t
left join auth.users u on u.id = t.user_id
where lower(t.login_username) = 'jfuller';

-- Auth users that might match (even if not linked):
select id, email, email_confirmed_at, raw_user_meta_data
from auth.users
where lower(email) like '%jfuller%';

-- After creating the user in Dashboard (Authentication → Users), link them:
-- update public.technicians t
-- set user_id = u.id
-- from auth.users u
-- where lower(t.login_username) = 'jfuller'
--   and lower(u.email) = lower(t.login_email);
