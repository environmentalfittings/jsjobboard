-- Ensure every active roster employee has a Shop assignment (technicians) row.
-- Safe to re-run. Does not overwrite an existing App role / group_team when present.
--
-- Run in Supabase → SQL Editor.

begin;

-- Link + refresh rows that already match by username or employee #
update public.technicians t
set
  name = e.full_name,
  employee_id = coalesce(nullif(trim(e.employee_no), ''), t.employee_id),
  login_username = lower(trim(e.username)),
  login_email = coalesce(
    nullif(trim(t.login_email), ''),
    lower(trim(e.username)) || '@users.jsvalve.local'
  ),
  user_id = coalesce(t.user_id, e.auth_user_id),
  active = true,
  group_team = coalesce(
    nullif(trim(t.group_team), ''),
    case when e.company ilike '%vsi%' then 'VSI' else null end
  ),
  updated_at = now()
from public.employees e
where e.is_active = true
  and nullif(trim(e.username), '') is not null
  and (
    lower(t.login_username) = lower(trim(e.username))
    or (
      nullif(trim(e.employee_no), '') is not null
      and t.employee_id = trim(e.employee_no)
    )
  );

-- Insert missing shop assignments
insert into public.technicians (
  name,
  employee_id,
  login_username,
  login_email,
  role,
  active,
  work_cell_specialties,
  group_team,
  user_id
)
select
  e.full_name,
  nullif(trim(e.employee_no), ''),
  lower(trim(e.username)),
  lower(trim(e.username)) || '@users.jsvalve.local',
  'technician',
  true,
  '{}'::text[],
  case when e.company ilike '%vsi%' then 'VSI' else null end,
  e.auth_user_id
from public.employees e
where e.is_active = true
  and nullif(trim(e.username), '') is not null
  and not exists (
    select 1
    from public.technicians t
    where lower(t.login_username) = lower(trim(e.username))
       or (
         nullif(trim(e.employee_no), '') is not null
         and t.employee_id = trim(e.employee_no)
       )
  );

-- Preview: active employees still missing a shop assignment (should be 0)
select
  e.full_name,
  e.username,
  e.employee_no,
  e.company
from public.employees e
where e.is_active = true
  and nullif(trim(e.username), '') is not null
  and not exists (
    select 1
    from public.technicians t
    where lower(t.login_username) = lower(trim(e.username))
       or (
         nullif(trim(e.employee_no), '') is not null
         and t.employee_id = trim(e.employee_no)
       )
  )
order by e.full_name;

commit;
