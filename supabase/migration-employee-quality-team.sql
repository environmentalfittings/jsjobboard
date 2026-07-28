-- Quality Team membership / hierarchy level on the employees roster.
-- Levels: none (not on team), admin, manager, supervisor, technician.
-- Access differences by level will be added later.
-- Run in Supabase SQL Editor. Safe to re-run.
--
-- Admin check mirrors set_employee_is_tester / AuthContext.

alter table public.employees
  add column if not exists quality_team_level text not null default 'none';

do $$
begin
  update public.employees
  set quality_team_level = 'none'
  where quality_team_level is null
     or quality_team_level not in ('none', 'admin', 'manager', 'supervisor', 'technician');

  alter table public.employees
    drop constraint if exists employees_quality_team_level_check;

  alter table public.employees
    add constraint employees_quality_team_level_check
    check (quality_team_level in ('none', 'admin', 'manager', 'supervisor', 'technician'));
exception
  when others then
    raise notice 'quality_team_level constraint setup: %', sqlerrm;
end $$;

create index if not exists employees_quality_team_level_idx
  on public.employees (quality_team_level)
  where quality_team_level <> 'none';

create or replace function public.set_employee_quality_team_level(
  p_employee_id uuid,
  p_quality_team_level text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean := false;
  v_username text;
  v_level text := lower(trim(coalesce(p_quality_team_level, 'none')));
begin
  if v_level not in ('none', 'admin', 'manager', 'supervisor', 'technician') then
    raise exception 'Invalid quality team level';
  end if;

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
    raise exception 'Only Admin can update quality team level';
  end if;

  update public.employees
  set quality_team_level = v_level
  where id = p_employee_id;

  if not found then
    raise exception 'Employee not found';
  end if;
end;
$$;

revoke all on function public.set_employee_quality_team_level(uuid, text) from public;
grant execute on function public.set_employee_quality_team_level(uuid, text) to authenticated;
