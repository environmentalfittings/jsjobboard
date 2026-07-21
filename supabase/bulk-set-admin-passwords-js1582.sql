-- Set password to Js1582 for all shop Admins only.
-- New blank query in Supabase SQL Editor → paste → Run (Role: postgres).

create extension if not exists pgcrypto;

begin;

update auth.users u
set
  encrypted_password = crypt('Js1582', gen_salt('bf')),
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
where u.id in (
  -- Technicians marked Admin
  select t.user_id
  from public.technicians t
  where t.user_id is not null
    and lower(coalesce(t.role, '')) = 'admin'

  union

  -- Profiles marked admin (covers accounts linked via employees)
  select p.id
  from public.profiles p
  where lower(coalesce(p.role, '')) = 'admin'
);

commit;

-- Who was updated
select
  u.email,
  t.login_username,
  t.name as technician_name,
  t.role as technician_role,
  p.role as profile_role
from auth.users u
left join public.technicians t on t.user_id = u.id
left join public.profiles p on p.id = u.id
where u.id in (
  select t2.user_id
  from public.technicians t2
  where t2.user_id is not null
    and lower(coalesce(t2.role, '')) = 'admin'
  union
  select p2.id
  from public.profiles p2
  where lower(coalesce(p2.role, '')) = 'admin'
)
order by coalesce(t.login_username, u.email);
