-- Allow Read-only (viewer) App role on shop assignment for sales / office logins.
-- Viewer can browse the job board like Admin but cannot change data and cannot open Employees.
-- Legacy role value "sales" is normalized to viewer in the app; keep it accepted by the DB check.

begin;

-- Normalize any existing sales rows to viewer (optional but keeps one canonical value).
update public.technicians
set role = 'viewer'
where lower(trim(coalesce(role, ''))) in ('sales', 'readonly', 'read-only', 'guest');

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'technicians'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
  loop
    execute format('alter table public.technicians drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.technicians
  add constraint technicians_role_check
  check (
    role is null
    or role in ('admin', 'manager', 'supervisor', 'technician', 'viewer', 'sales')
  );

comment on column public.technicians.role is
  'App login permissions: admin | manager | technician | viewer (read-only / sales).';

commit;
