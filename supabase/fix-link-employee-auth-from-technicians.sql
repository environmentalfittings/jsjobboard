-- Link Mike Dunn (and any similar rows) so Employees and Technicians share the same auth user.
-- Run in Supabase SQL Editor if Mike still missing from Messages after app deploy.

update public.employees e
set auth_user_id = t.user_id
from public.technicians t
where e.auth_user_id is null
  and t.user_id is not null
  and t.active = true
  and (
    trim(t.employee_id) = trim(e.employee_no)
    or lower(trim(t.login_username)) = lower(trim(e.username))
  );

-- Mike Dunn specifically (employee 000899 / mdunn)
update public.employees e
set auth_user_id = t.user_id
from public.technicians t
where lower(trim(e.username)) = 'mdunn'
  and lower(trim(t.login_username)) = 'mdunn'
  and t.user_id is not null
  and (e.auth_user_id is null or e.auth_user_id <> t.user_id);

select e.full_name, e.username, e.auth_user_id, t.name, t.login_username, t.user_id
from public.employees e
left join public.technicians t on lower(trim(t.login_username)) = lower(trim(e.username))
where lower(e.full_name) like '%dunn%'
   or lower(e.username) = 'mdunn';
