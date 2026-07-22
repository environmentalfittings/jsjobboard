-- Designate which employees appear in the Test Log tester dropdown.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Admin check mirrors AuthContext:
-- technicians.role = admin via user_id OR login_username (employees / JWT),
-- then profiles.role / JWT metadata fallback.

alter table public.employees
  add column if not exists is_tester boolean not null default false;

create index if not exists employees_is_tester_idx
  on public.employees (is_tester)
  where is_tester = true;

create or replace function public.set_employee_is_tester(
  p_employee_id uuid,
  p_is_tester boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_username text;
begin
  v_username := lower(trim(coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'username', ''),
    split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
    ''
  )));

  select exists (
    select 1
    from public.technicians t
    where coalesce(t.active, true) = true
      and lower(trim(coalesce(t.role, ''))) = 'admin'
      and (
        t.user_id = auth.uid()
        or (
          v_username <> ''
          and lower(trim(coalesce(t.login_username, ''))) = v_username
        )
        or exists (
          select 1
          from public.employees e
          where e.auth_user_id = auth.uid()
            and lower(trim(coalesce(e.username, ''))) = lower(trim(coalesce(t.login_username, '')))
            and length(trim(coalesce(t.login_username, ''))) > 0
        )
      )
  )
  into v_is_admin;

  if not v_is_admin then
    v_is_admin := lower(trim(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ))) = 'admin';
  end if;

  if not v_is_admin then
    select exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin'
    )
    into v_is_admin;
  end if;

  if not v_is_admin then
    raise exception 'Only Admin can update tester designation';
  end if;

  update public.employees
  set is_tester = coalesce(p_is_tester, false)
  where id = p_employee_id;

  if not found then
    raise exception 'Employee not found';
  end if;
end;
$$;

revoke all on function public.set_employee_is_tester(uuid, boolean) from public;
grant execute on function public.set_employee_is_tester(uuid, boolean) to authenticated;
