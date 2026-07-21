-- Last Sign In on Employees page without relying on manage-employee-account edge function.
-- Reads auth.users.last_sign_in_at for linked employee accounts.

create or replace function public.employee_last_sign_ins(p_employee_ids uuid[])
returns table (employee_id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public, auth
stable
as $$
  select
    e.id as employee_id,
    u.last_sign_in_at
  from public.employees e
  left join auth.users u on u.id = e.auth_user_id
  where e.id = any (p_employee_ids);
$$;

revoke all on function public.employee_last_sign_ins(uuid[]) from public;
grant execute on function public.employee_last_sign_ins(uuid[]) to authenticated;
grant execute on function public.employee_last_sign_ins(uuid[]) to service_role;
