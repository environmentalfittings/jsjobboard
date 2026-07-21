-- Bulk-set shop login passwords to: Jsvalves
-- Run once in Supabase SQL Editor (Role: postgres).
-- Updates every Auth user linked to employees OR technicians.
-- People with NO Auth user still need Create Account / Reset password first.

create extension if not exists pgcrypto;

begin;

update auth.users u
set
  encrypted_password = crypt('Jsvalves', gen_salt('bf')),
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
where u.id in (
  select e.auth_user_id
  from public.employees e
  where e.auth_user_id is not null
  union
  select t.user_id
  from public.technicians t
  where t.user_id is not null
);

commit;

-- How many were updated
select count(*) as passwords_set_to_jsvalves
from auth.users u
where u.id in (
  select e.auth_user_id from public.employees e where e.auth_user_id is not null
  union
  select t.user_id from public.technicians t where t.user_id is not null
);

-- Still need an account created (cannot set password until Auth exists)
select
  t.login_username,
  t.name,
  t.login_email
from public.technicians t
where t.active = true
  and t.login_username is not null
  and t.user_id is null
  and not exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(coalesce(t.login_email, t.login_username || '@jsvalve.com'))
  )
order by t.name;
