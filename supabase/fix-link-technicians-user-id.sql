-- Link technicians.user_id from employees.auth_user_id when emails/usernames match.
-- Run after bulk-create-employee-accounts.sql if My Work cannot find a technician profile.

update public.technicians t
set user_id = e.auth_user_id
from public.employees e
where e.auth_user_id is not null
  and lower(e.username) = lower(t.login_username)
  and (t.user_id is null or t.user_id <> e.auth_user_id);

update public.technicians t
set user_id = u.id
from auth.users u
where t.user_id is null
  and t.login_email is not null
  and lower(u.email) = lower(t.login_email);

-- Verify Gary / sample row
select e.username, e.full_name, e.auth_user_id, t.id as technician_id, t.user_id, t.login_email
from public.employees e
left join public.technicians t on lower(t.login_username) = lower(e.username)
where e.username = 'ghensley';

-- Resolve the signed-in user's technician row (bypasses RLS for shop staff).
create or replace function public.get_my_technician_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row jsonb;
begin
  select to_jsonb(t) into row
  from public.technicians t
  where t.user_id = auth.uid()
  limit 1;

  if row is not null then
    return row;
  end if;

  select to_jsonb(t) into row
  from public.employees e
  join public.technicians t on lower(t.login_username) = lower(e.username)
  where e.auth_user_id = auth.uid()
  limit 1;

  if row is not null then
    return row;
  end if;

  select to_jsonb(t) into row
  from public.technicians t
  where t.login_email is not null
    and lower(t.login_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;

  return row;
end;
$$;

revoke all on function public.get_my_technician_profile() from public;
grant execute on function public.get_my_technician_profile() to authenticated;
