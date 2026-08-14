-- Customer inventory: soft-remove with reason + purchase order.
-- Safe to re-run.

alter table public.inventory
  add column if not exists removed_at timestamptz;

alter table public.inventory
  add column if not exists removed_reason text;

alter table public.inventory
  add column if not exists removed_po_number text;

alter table public.inventory
  add column if not exists removed_by_user_id uuid;

alter table public.inventory
  add column if not exists removed_by_name text;

comment on column public.inventory.removed_at is 'When the item was removed from active customer inventory';
comment on column public.inventory.removed_reason is 'Required reason captured at removal';
comment on column public.inventory.removed_po_number is 'Required purchase order number captured at removal';
comment on column public.inventory.removed_by_user_id is 'Auth user who removed the item';
comment on column public.inventory.removed_by_name is 'Display name of who removed the item';

create index if not exists idx_inventory_removed_at
  on public.inventory (removed_at);
