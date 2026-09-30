-- Who pressed Shipped / when the job was closed to Completed from Warehouse RTS / Shipping.
-- Run once in Supabase SQL Editor. Safe to re-run.

begin;

alter table public.valves
  add column if not exists shipment_closed_by text;

alter table public.valves
  add column if not exists shipment_closed_at timestamptz;

comment on column public.valves.shipment_closed_by is
  'Display name of the user who pressed Shipped (Warehouse RTS / Shipping → Completed).';
comment on column public.valves.shipment_closed_at is
  'When Shipped was pressed and the job was set to Completed.';

create index if not exists valves_shipment_closed_at_idx
  on public.valves (shipment_closed_at desc nulls last)
  where shipment_closed_at is not null;

commit;
