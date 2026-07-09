-- Shop login helpers + repair bulk-created auth users so GoTrue can sign them in.
-- Run in Supabase SQL Editor after bulk-create-employee-accounts.sql.

create or replace function public.resolve_shop_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select lower(trim(t.login_email))
      from public.technicians t
      where lower(trim(t.login_username)) = lower(trim(p_username))
        and t.active = true
        and t.login_email is not null
        and length(trim(t.login_email)) > 0
      order by t.id
      limit 1
    ),
    lower(trim(p_username)) || '@jsvalve.com'
  );
$$;

create or replace function public.employee_shop_login_status(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_username text := lower(trim(p_username));
  v_employee public.employees%rowtype;
begin
  select * into v_employee
  from public.employees
  where lower(username) = v_username
  limit 1;

  if not found then
    return 'not_found';
  end if;

  if not v_employee.is_active then
    return 'inactive';
  end if;

  if v_employee.auth_user_id is not null then
    return 'ready';
  end if;

  if exists (
    select 1
    from auth.users u
    where lower(u.email) in (
      lower(trim(p_username)) || '@jsvalve.com',
      lower(trim(p_username)) || '@users.jsvalve.local'
    )
  ) then
    return 'ready';
  end if;

  return 'no_account';
end;
$$;

revoke all on function public.resolve_shop_login_email(text) from public;
revoke all on function public.employee_shop_login_status(text) from public;
grant execute on function public.resolve_shop_login_email(text) to anon, authenticated;
grant execute on function public.employee_shop_login_status(text) to anon, authenticated;

-- GoTrue expects empty strings, not NULL, on several token columns.
update auth.users
set
  email_change = coalesce(email_change, ''),
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, '')
where email ilike '%@jsvalve.com'
   or email ilike '%@users.jsvalve.local';

-- Mark shop emails verified in identity records created via SQL bulk insert.
update auth.identities i
set identity_data = i.identity_data || jsonb_build_object('email_verified', true)
from auth.users u
where i.user_id = u.id
  and i.provider = 'email'
  and (
    u.email ilike '%@jsvalve.com'
    or u.email ilike '%@users.jsvalve.local'
  )
  and coalesce(i.identity_data->>'email_verified', 'false') <> 'true';

-- Link employees to auth users when the row exists but auth_user_id was not set.
update public.employees e
set auth_user_id = u.id
from auth.users u
where e.auth_user_id is null
  and lower(u.email) = lower(e.username || '@jsvalve.com');
