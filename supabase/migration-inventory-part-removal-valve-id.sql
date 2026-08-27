-- Customer inventory: destination valve ID when removing a valve part.
-- Safe to re-run.

alter table public.inventory
  add column if not exists removed_destination_valve_id text;

comment on column public.inventory.removed_destination_valve_id is
  'Valve ID / tag the removed part is going into (required when removing valve parts)';
