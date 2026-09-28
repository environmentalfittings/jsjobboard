-- Multi-company foundation (organizations + membership).
-- DO NOT run on production until you are ready to enable multi-company.
-- Safe to re-run after review.
--
-- Adds:
--   organizations
--   organization_members (per-user company access + org role)
-- Seeds JS Valve and grants current shop admins super_admin there.
--
-- App soft-fails if these tables are missing (current single-company behavior).
-- Production Vercel also requires VITE_ENABLE_MULTI_COMPANY=true before the
-- client uses these tables — so deploying the app alone does not change JS Valve.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_unique unique (slug)
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  employee_id uuid references public.employees (id) on delete set null,
  -- Org-level role. App shop permissions still use technicians.role for now.
  role text not null default 'technician'
    check (role in ('super_admin', 'admin', 'manager', 'technician', 'viewer')),
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_members_user_or_employee check (user_id is not null or employee_id is not null)
);

create unique index if not exists organization_members_org_user_uidx
  on public.organization_members (organization_id, user_id)
  where user_id is not null;

create unique index if not exists organization_members_org_employee_uidx
  on public.organization_members (organization_id, employee_id)
  where employee_id is not null;

create index if not exists organization_members_user_access_idx
  on public.organization_members (user_id)
  where can_access = true and user_id is not null;

create index if not exists organization_members_employee_access_idx
  on public.organization_members (employee_id)
  where can_access = true and employee_id is not null;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
before update on public.organizations
for each row
execute function public.set_updated_at();

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
before update on public.organization_members
for each row
execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

drop policy if exists "authenticated read organizations" on public.organizations;
create policy "authenticated read organizations"
on public.organizations
for select
to authenticated
using (true);

drop policy if exists "authenticated read organization_members" on public.organization_members;
create policy "authenticated read organization_members"
on public.organization_members
for select
to authenticated
using (true);

insert into public.organizations (name, slug, is_active)
values ('JS Valve', 'js-valve', true)
on conflict (slug) do update
set name = excluded.name,
    is_active = true,
    updated_at = now();

-- Promote current shop admins to super_admin on JS Valve.
insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
select
  o.id,
  t.user_id,
  e.id,
  'super_admin',
  true
from public.organizations o
join public.technicians t
  on lower(trim(coalesce(t.role, ''))) = 'admin'
 and t.user_id is not null
 and coalesce(t.active, true) = true
left join public.employees e
  on e.auth_user_id = t.user_id
where o.slug = 'js-valve'
  and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = o.id
      and m.user_id = t.user_id
  );

update public.organization_members m
set
  role = 'super_admin',
  can_access = true,
  updated_at = now()
from public.organizations o
join public.technicians t
  on lower(trim(coalesce(t.role, ''))) = 'admin'
 and t.user_id is not null
 and coalesce(t.active, true) = true
where o.slug = 'js-valve'
  and m.organization_id = o.id
  and m.user_id = t.user_id;

-- Give every linked employee access to JS Valve (role from shop assignment when present).
insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
select
  o.id,
  e.auth_user_id,
  e.id,
  case
    when lower(trim(coalesce(t.role, ''))) = 'admin' then 'admin'
    when lower(trim(coalesce(t.role, ''))) in ('manager', 'supervisor') then 'manager'
    when lower(trim(coalesce(t.role, ''))) in ('viewer', 'readonly', 'read-only', 'guest') then 'viewer'
    else 'technician'
  end,
  true
from public.organizations o
join public.employees e
  on e.auth_user_id is not null
 and coalesce(e.is_active, true) = true
left join public.technicians t
  on t.user_id = e.auth_user_id
 and coalesce(t.active, true) = true
where o.slug = 'js-valve'
  and not exists (
    select 1
    from public.organization_members m
    where m.organization_id = o.id
      and m.user_id = e.auth_user_id
  );

create or replace function public.is_org_super_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.user_id = p_user_id
      and m.can_access = true
      and m.role = 'super_admin'
  );
$$;

create or replace function public.can_manage_organization_members(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_org_super_admin(p_user_id)
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = p_organization_id
        and m.user_id = p_user_id
        and m.can_access = true
        and m.role in ('super_admin', 'admin')
    );
$$;

create or replace function public.set_employee_organization_access(
  p_employee_id uuid,
  p_organization_id uuid,
  p_can_access boolean,
  p_role text default null
)
returns public.organization_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee public.employees%rowtype;
  v_role text;
  v_row public.organization_members;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.can_manage_organization_members(p_organization_id, auth.uid()) then
    raise exception 'Only a company admin or super admin can change company access';
  end if;

  select * into v_employee
  from public.employees
  where id = p_employee_id;

  if not found then
    raise exception 'Employee not found';
  end if;

  v_role := lower(trim(coalesce(p_role, '')));
  if v_role = '' then
    select case
      when lower(trim(coalesce(t.role, ''))) = 'admin' then 'admin'
      when lower(trim(coalesce(t.role, ''))) in ('manager', 'supervisor') then 'manager'
      when lower(trim(coalesce(t.role, ''))) in ('viewer', 'readonly', 'read-only', 'guest') then 'viewer'
      else 'technician'
    end
    into v_role
    from public.technicians t
    where t.user_id = v_employee.auth_user_id
      and coalesce(t.active, true) = true
    limit 1;

    v_role := coalesce(nullif(v_role, ''), 'technician');
  end if;

  if v_role not in ('super_admin', 'admin', 'manager', 'technician', 'viewer') then
    raise exception 'Invalid organization role';
  end if;

  if v_role = 'super_admin' and not public.is_org_super_admin(auth.uid()) then
    raise exception 'Only a super admin can assign the super admin role';
  end if;

  if v_employee.auth_user_id is not null then
    update public.organization_members
    set
      employee_id = coalesce(employee_id, p_employee_id),
      can_access = coalesce(p_can_access, false),
      role = case
        when role = 'super_admin' and not public.is_org_super_admin(auth.uid()) then role
        else v_role
      end,
      updated_at = now()
    where organization_id = p_organization_id
      and user_id = v_employee.auth_user_id
    returning * into v_row;

    if found then
      return v_row;
    end if;

    insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
    values (p_organization_id, v_employee.auth_user_id, p_employee_id, v_role, coalesce(p_can_access, false))
    returning * into v_row;
    return v_row;
  end if;

  update public.organization_members
  set
    can_access = coalesce(p_can_access, false),
    role = case
      when role = 'super_admin' and not public.is_org_super_admin(auth.uid()) then role
      else v_role
    end,
    updated_at = now()
  where organization_id = p_organization_id
    and employee_id = p_employee_id
  returning * into v_row;

  if found then
    return v_row;
  end if;

  insert into public.organization_members (organization_id, user_id, employee_id, role, can_access)
  values (p_organization_id, null, p_employee_id, v_role, coalesce(p_can_access, false))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_logo_url text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(regexp_replace(coalesce(p_slug, ''), '[^a-zA-Z0-9]+', '-', 'g')));
  v_row public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_org_super_admin(auth.uid()) then
    raise exception 'Only a super admin can create companies';
  end if;
  if v_name = '' then
    raise exception 'Company name is required';
  end if;
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    raise exception 'Company slug is required';
  end if;

  insert into public.organizations (name, slug, logo_url, is_active)
  values (v_name, v_slug, nullif(trim(coalesce(p_logo_url, '')), ''), true)
  returning * into v_row;

  insert into public.organization_members (organization_id, user_id, role, can_access)
  values (v_row.id, auth.uid(), 'super_admin', true);

  return v_row;
exception
  when unique_violation then
    select * into v_row
    from public.organizations
    where slug = v_slug;

    if not found then
      raise exception 'Company slug already exists';
    end if;

    update public.organization_members
    set role = 'super_admin', can_access = true, updated_at = now()
    where organization_id = v_row.id
      and user_id = auth.uid();

    if not found then
      insert into public.organization_members (organization_id, user_id, role, can_access)
      values (v_row.id, auth.uid(), 'super_admin', true);
    end if;

    return v_row;
end;
$$;

grant execute on function public.is_org_super_admin(uuid) to authenticated;
grant execute on function public.can_manage_organization_members(uuid, uuid) to authenticated;
grant execute on function public.set_employee_organization_access(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.create_organization(text, text, text) to authenticated;

commit;
