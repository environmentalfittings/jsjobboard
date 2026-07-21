-- Deduplicate technicians and collapse roles to admin / manager / technician.
-- Run in Supabase SQL Editor. Review the preview queries before the destructive steps.

-- 1) Preview likely duplicate groups (same name, or same login username, or same employee_id)
-- select lower(trim(name)) as name_key, count(*) as rows, array_agg(id order by id) as ids
-- from public.technicians
-- group by 1
-- having count(*) > 1;

-- select lower(trim(login_username)) as username_key, count(*) as rows, array_agg(id order by id) as ids
-- from public.technicians
-- where login_username is not null and length(trim(login_username)) > 0
-- group by 1
-- having count(*) > 1;

begin;

-- Prefer the row that has a login / auth link as the keeper within each name group.
with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
),
keepers as (
  select id as keep_id, name_key from ranked where rn = 1
),
dupes as (
  select r.id as drop_id, k.keep_id
  from ranked r
  join keepers k on k.name_key = r.name_key
  where r.rn > 1
)
-- Remap job assignments from duplicate ids onto the keeper
update public.job_technicians jt
set technician_id = d.keep_id
from dupes d
where jt.technician_id = d.drop_id
  and not exists (
    select 1 from public.job_technicians x
    where x.valve_row_id = jt.valve_row_id and x.technician_id = d.keep_id
  );

with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
),
keepers as (
  select id as keep_id, name_key from ranked where rn = 1
),
dupes as (
  select r.id as drop_id, k.keep_id
  from ranked r
  join keepers k on k.name_key = r.name_key
  where r.rn > 1
)
delete from public.job_technicians jt
using dupes d
where jt.technician_id = d.drop_id;

-- Remap valve assigned_technician_id
with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
),
keepers as (
  select id as keep_id, name_key from ranked where rn = 1
),
dupes as (
  select r.id as drop_id, k.keep_id
  from ranked r
  join keepers k on k.name_key = r.name_key
  where r.rn > 1
)
update public.valves v
set assigned_technician_id = d.keep_id
from dupes d
where v.assigned_technician_id = d.drop_id;

-- Remap supervisor / manager self-refs
with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
),
keepers as (
  select id as keep_id, name_key from ranked where rn = 1
),
dupes as (
  select r.id as drop_id, k.keep_id
  from ranked r
  join keepers k on k.name_key = r.name_key
  where r.rn > 1
)
update public.technicians t
set supervisor_id = d.keep_id
from dupes d
where t.supervisor_id = d.drop_id;

with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
),
keepers as (
  select id as keep_id, name_key from ranked where rn = 1
),
dupes as (
  select r.id as drop_id, k.keep_id
  from ranked r
  join keepers k on k.name_key = r.name_key
  where r.rn > 1
)
update public.technicians t
set manager_id = d.keep_id
from dupes d
where t.manager_id = d.drop_id;

-- Delete duplicate technician rows (keepers remain)
with ranked as (
  select
    id,
    lower(trim(name)) as name_key,
    row_number() over (
      partition by lower(trim(name))
      order by
        case when user_id is not null then 0 else 1 end,
        case when login_username is not null and length(trim(login_username)) > 0 then 0 else 1 end,
        case when active then 0 else 1 end,
        id asc
    ) as rn
  from public.technicians
)
delete from public.technicians t
using ranked r
where t.id = r.id
  and r.rn > 1;

-- Collapse legacy roles
update public.technicians
set role = 'manager'
where lower(coalesce(role, '')) in ('supervisor');

update public.technicians
set role = 'technician'
where lower(coalesce(role, '')) in ('sales', 'tech')
   or role is null
   or length(trim(role)) = 0;

update public.technicians
set role = 'technician'
where lower(coalesce(role, '')) not in ('admin', 'manager', 'technician');

-- Tighten role check constraint
alter table public.technicians drop constraint if exists technicians_role_check;
alter table public.technicians
  add constraint technicians_role_check
  check (role is null or role in ('admin', 'manager', 'technician'));

commit;
