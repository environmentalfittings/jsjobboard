-- Customer inventory: distinguish valve parts from complete valves.
-- Default false = valve. Safe to re-run.

alter table public.inventory
  add column if not exists is_valve_part boolean not null default false;

comment on column public.inventory.is_valve_part is
  'True when this inventory item is a valve part (not a complete valve). Default false = valve.';
