-- Inventory access for authenticated shop users (Admin Inventory page).
-- Safe to re-run.

alter table public.inventory enable row level security;

drop policy if exists "inventory_authenticated_select" on public.inventory;
create policy "inventory_authenticated_select"
  on public.inventory
  for select
  to authenticated
  using (true);

drop policy if exists "inventory_authenticated_insert" on public.inventory;
create policy "inventory_authenticated_insert"
  on public.inventory
  for insert
  to authenticated
  with check (true);

drop policy if exists "inventory_authenticated_update" on public.inventory;
create policy "inventory_authenticated_update"
  on public.inventory
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "inventory_authenticated_delete" on public.inventory;
create policy "inventory_authenticated_delete"
  on public.inventory
  for delete
  to authenticated
  using (true);

-- Lookup tables used when saving inventory manufacturer / valve type FKs.
alter table public.manufacturers enable row level security;
drop policy if exists "manufacturers_authenticated_all" on public.manufacturers;
create policy "manufacturers_authenticated_all"
  on public.manufacturers
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.valve_types enable row level security;
drop policy if exists "valve_types_authenticated_all" on public.valve_types;
create policy "valve_types_authenticated_all"
  on public.valve_types
  for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.inventory to authenticated;
grant select, insert, update, delete on public.manufacturers to authenticated;
grant select, insert, update, delete on public.valve_types to authenticated;
