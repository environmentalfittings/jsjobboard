-- Add sales as a technician app role (replaces sales_classification if that was added).

alter table public.technicians drop column if exists sales_classification;
drop index if exists idx_technicians_sales_classification;

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
  check (role in ('admin', 'manager', 'supervisor', 'technician', 'sales'));
