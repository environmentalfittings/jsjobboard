-- NEW blank query only — delete everything else in the editor first.
-- Run all of this once.

update public.technicians
set
  name = 'Mike Dunn',
  employee_id = '000899',
  login_email = 'mdunn@jsvalve.com',
  active = true
where lower(login_username) = 'mdunn';

update public.technicians
set user_id = null
where lower(login_username) = 'bdunn'
   or lower(name) in ('brian dunn', 'brian m. dunn');

delete from public.technicians
where lower(login_username) = 'bdunn'
   or lower(name) in ('brian dunn', 'brian m. dunn');

update public.employees
set
  first_name = 'Mike',
  last_name = 'Dunn',
  full_name = 'Mike Dunn',
  username = 'mdunn',
  initials = 'MD'
where employee_no = '000899'
   or lower(username) = 'bdunn';

select id, name, employee_id, login_username, login_email, role, active
from public.technicians
where lower(login_username) = 'mdunn'
   or lower(name) like '%dunn%';
