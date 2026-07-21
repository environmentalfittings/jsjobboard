-- Sync profiles.role from technicians.role (shop source of truth).
-- Fixes Managers/Technicians who still show as Admin because profiles defaulted to admin.
-- Run in Supabase SQL Editor.

-- 1) Managers / technicians must NOT keep profiles.role = 'admin'
update public.profiles p
set role = 'viewer'
from public.technicians t
where t.user_id = p.id
  and lower(coalesce(t.role, '')) in ('manager', 'technician', 'supervisor', 'tech', 'sales')
  and lower(coalesce(p.role, '')) = 'admin';

-- 2) Shop admins should have profiles.role = 'admin'
update public.profiles p
set role = 'admin'
from public.technicians t
where t.user_id = p.id
  and lower(coalesce(t.role, '')) = 'admin'
  and lower(coalesce(p.role, '')) is distinct from 'admin';

-- 3) Coy Belden / cbelden specifically (even if user_id link is odd)
update public.profiles p
set role = 'viewer'
where p.id in (
  select t.user_id
  from public.technicians t
  where t.user_id is not null
    and (
      lower(coalesce(t.login_username, '')) = 'cbelden'
      or lower(t.name) like 'coy%belden%'
    )
)
or p.id in (
  select e.auth_user_id
  from public.employees e
  where e.auth_user_id is not null
    and lower(e.username) = 'cbelden'
);

-- 4) Make sure Coy's technician row is Manager + linked
update public.technicians
set role = 'manager'
where lower(coalesce(login_username, '')) = 'cbelden'
   or lower(name) like 'coy%belden%';

-- 5) Clear stale Auth metadata role=admin for non-admin shop users
update auth.users u
set
  raw_user_meta_data =
    coalesce(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', lower(coalesce(t.role, 'technician')))
from public.technicians t
where t.user_id = u.id
  and lower(coalesce(t.role, '')) in ('manager', 'technician', 'supervisor', 'tech', 'sales')
  and lower(coalesce(u.raw_user_meta_data->>'role', '')) = 'admin';

-- Verify
select
  t.name,
  t.login_username,
  t.role as technician_role,
  t.user_id,
  p.role as profile_role,
  u.email,
  u.raw_user_meta_data ->> 'role' as metadata_role
from public.technicians t
left join public.profiles p on p.id = t.user_id
left join auth.users u on u.id = t.user_id
where lower(coalesce(t.login_username, '')) = 'cbelden'
   or lower(t.name) like 'coy%belden%';
