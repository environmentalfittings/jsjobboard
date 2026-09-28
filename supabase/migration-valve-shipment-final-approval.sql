-- Final shipment approval for Warehouse RTS / Shipping jobs (dashboard checkbox).
-- Run once in Supabase SQL Editor.

begin;

alter table public.valves
  add column if not exists shipment_final_approved boolean not null default false;

alter table public.valves
  add column if not exists shipment_final_approved_by text;

alter table public.valves
  add column if not exists shipment_final_approved_at timestamptz;

comment on column public.valves.shipment_final_approved is
  'Dashboard final approval for shipment (Warehouse RTS / Shipping).';
comment on column public.valves.shipment_final_approved_by is
  'Display name of the user who checked final shipment approval.';
comment on column public.valves.shipment_final_approved_at is
  'When final shipment approval was checked.';

create index if not exists valves_shipment_final_approved_idx
  on public.valves (status, shipment_final_approved)
  where status in ('Warehouse RTS', 'Shipping');

commit;
