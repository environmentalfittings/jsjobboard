-- Allow Stock and Ordered on Parts (valve_outsourced_items.status).
-- Run once in Supabase SQL Editor.

begin;

alter table public.valve_outsourced_items
  drop constraint if exists valve_outsourced_items_status_chk;

alter table public.valve_outsourced_items
  add constraint valve_outsourced_items_status_chk
  check (status in ('stock', 'ordered', 'not_shipped', 'shipped', 'received'));

commit;
