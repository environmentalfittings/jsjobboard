-- Who can log in? Run in Supabase SQL Editor.
-- ready = Auth user exists and is linked
-- no_auth = roster/tech exists but no Auth user (need Create Account / Reset password)
-- password unknown = Auth exists; if login fails, Admin must Reset password

-- Employees roster
select
  e.username,
  e.full_name,
  e.is_active,
  e.auth_user_id is not null as linked_on_employees,
  u.email as auth_email,
  u.last_sign_in_at,
  case
    when e.auth_user_id is null and u.id is null then 'NO AUTH — create account'
    when e.auth_user_id is null and u.id is not null then 'AUTH EXISTS — link auth_user_id'
    when e.auth_user_id is not null and u.last_sign_in_at is null then 'HAS AUTH — never signed in (reset password if login fails)'
    else 'HAS AUTH — has signed in before'
  end as login_notes
from public.employees e
left join auth.users u
  on u.id = e.auth_user_id
  or lower(u.email) = lower(e.username || '@jsvalve.com')
order by e.full_name;

-- Technicians shop logins
select
  t.login_username,
  t.name,
  t.active,
  t.login_email,
  t.user_id is not null as linked_on_technicians,
  u.email as auth_email,
  u.last_sign_in_at,
  case
    when t.login_username is null then 'NO USERNAME'
    when t.user_id is null and u.id is null then 'NO AUTH — use Reset password on Technicians'
    when t.user_id is null and u.id is not null then 'AUTH EXISTS — link user_id'
    else 'HAS AUTH — reset password if login fails'
  end as login_notes
from public.technicians t
left join auth.users u
  on u.id = t.user_id
  or (t.login_email is not null and lower(u.email) = lower(t.login_email))
  or (t.login_username is not null and lower(u.email) = lower(t.login_username || '@jsvalve.com'))
where t.active = true
order by t.name;
