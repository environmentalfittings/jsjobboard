-- Shared monthly Customer Inventory report responsibility claims.
-- One claim per calendar month; dashboard reminder hides until the next month.
-- Safe to re-run.

begin;

create table if not exists public.inventory_monthly_report_claims (
  period_key text primary key,
  claimed_by_name text not null,
  claimed_by_user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now()
);

create index if not exists idx_inventory_monthly_report_claims_claimed_at
  on public.inventory_monthly_report_claims (claimed_at desc);

alter table public.inventory_monthly_report_claims enable row level security;

drop policy if exists "inventory_monthly_report_claims_select_authenticated"
  on public.inventory_monthly_report_claims;
create policy "inventory_monthly_report_claims_select_authenticated"
on public.inventory_monthly_report_claims
for select
to authenticated
using (true);

drop policy if exists "inventory_monthly_report_claims_insert_authenticated"
  on public.inventory_monthly_report_claims;
create policy "inventory_monthly_report_claims_insert_authenticated"
on public.inventory_monthly_report_claims
for insert
to authenticated
with check (true);

drop policy if exists "inventory_monthly_report_claims_update_authenticated"
  on public.inventory_monthly_report_claims;
create policy "inventory_monthly_report_claims_update_authenticated"
on public.inventory_monthly_report_claims
for update
to authenticated
using (true)
with check (true);

commit;
