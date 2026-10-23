-- Supabase Data API privileges for public tables / sequences.
--
-- Final notice (effective 2025-10-30): new tables in public no longer receive
-- automatic GRANTs for anon / authenticated / service_role. Without these,
-- supabase-js / PostgREST returns "permission denied" even when RLS allows the row.
--
-- Existing production tables created before that date keep their current grants.
-- Run this in Supabase → SQL Editor so:
--   • preview branches / db reset / new projects keep working
--   • any table created after the cutoff is reachable via the Data API
--   • future tables created by postgres inherit the same defaults
--
-- This project uses RLS as the real access control and often allows both anon
-- (local / shop PIN flows) and authenticated clients, so privileges match that.

begin;

grant usage on schema public to anon, authenticated, service_role;

-- Current tables
do $$
declare
  r record;
begin
  for r in
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p') -- ordinary + partitioned tables
      and c.relname not like 'pg_%'
  loop
    execute format(
      'grant select, insert, update, delete on table public.%I to anon, authenticated, service_role',
      r.name
    );
  end loop;
end $$;

-- Identity / serial sequences used by inserts
do $$
declare
  r record;
begin
  for r in
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    execute format(
      'grant usage, select on sequence public.%I to anon, authenticated, service_role',
      r.name
    );
  end loop;
end $$;

-- Future tables / sequences created by common migration roles
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute $sql$
      alter default privileges for role supabase_admin in schema public
        grant select, insert, update, delete on tables to anon, authenticated, service_role
    $sql$;
    execute $sql$
      alter default privileges for role supabase_admin in schema public
        grant usage, select on sequences to anon, authenticated, service_role
    $sql$;
  end if;
end $$;

commit;
