-- Additive: status + date_received on valve_outsourced_items.
-- Safe to run if migration-valve-outsourced-items.sql was already applied without these columns.

begin;

alter table public.valve_outsourced_items
  add column if not exists status text;
alter table public.valve_outsourced_items
  add column if not exists date_received date;

update public.valve_outsourced_items
set status = 'not_shipped'
where status is null or btrim(status) = '';

alter table public.valve_outsourced_items
  alter column status set default 'not_shipped';

alter table public.valve_outsourced_items
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'valve_outsourced_items_status_chk'
      and conrelid = 'public.valve_outsourced_items'::regclass
  ) then
    alter table public.valve_outsourced_items
      add constraint valve_outsourced_items_status_chk
      check (status in ('not_shipped', 'shipped', 'received'));
  end if;
end $$;

commit;
