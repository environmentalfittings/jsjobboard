-- Add John Nelson to Shop assignment as Admin (login permissions).
-- Links his existing employee + auth user so the Read-only banner clears after re-login.
-- Safe to re-run.

begin;

-- Shop assignment (App role = Admin)
update public.technicians t
set
  name = e.full_name,
  employee_id = e.employee_no,
  role = 'admin',
  active = true,
  group_team = 'VSI',
  user_id = coalesce(e.auth_user_id, t.user_id),
  updated_at = now()
from public.employees e
where lower(e.username) = 'jnelson'
  and lower(t.login_username) = 'jnelson';

insert into public.technicians (
  name,
  employee_id,
  login_username,
  role,
  active,
  work_cell_specialties,
  group_team,
  user_id
)
select
  e.full_name,
  e.employee_no,
  e.username,
  'admin',
  true,
  '{}'::text[],
  'VSI',
  e.auth_user_id
from public.employees e
where lower(e.username) = 'jnelson'
  and not exists (
    select 1 from public.technicians t where lower(t.login_username) = 'jnelson'
  );

-- Keep profiles.role in sync with shop Admin
update public.profiles p
set role = 'admin'
from public.employees e
where e.auth_user_id = p.id
  and lower(e.username) = 'jnelson';

-- Ensure VSI company exists
insert into public.organizations (name, slug, is_active)
values ('VSI', 'vsi', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

-- Promote existing VSI membership if present
update public.organization_members m
set
  role = 'admin',
  can_access = true,
  user_id = coalesce(m.user_id, e.auth_user_id),
  employee_id = coalesce(m.employee_id, e.id),
  updated_at = now()
from public.employees e
join public.organizations o on o.slug = 'vsi'
where lower(e.username) = 'jnelson'
  and m.organization_id = o.id
  and (m.employee_id = e.id or m.user_id = e.auth_user_id);

-- Insert VSI membership when missing
insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
select
  o.id,
  e.auth_user_id,
  e.id,
  'admin',
  true
from public.organizations o
cross join public.employees e
where o.slug = 'vsi'
  and lower(e.username) = 'jnelson'
  and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = o.id
      and (m.employee_id = e.id or m.user_id = e.auth_user_id)
  );

-- Preview
select t.id, t.name, t.login_username, t.role, t.group_team, t.user_id, t.active
from public.technicians t
where lower(t.login_username) = 'jnelson';

select p.id, p.role
from public.profiles p
join public.employees e on e.auth_user_id = p.id
where lower(e.username) = 'jnelson';

select o.slug, m.role, m.can_access
from public.organization_members m
join public.organizations o on o.id = m.organization_id
join public.employees e
  on e.id = m.employee_id or e.auth_user_id = m.user_id
where lower(e.username) = 'jnelson';

commit;
