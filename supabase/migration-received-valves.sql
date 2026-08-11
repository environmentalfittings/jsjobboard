-- Received valves log (shared across devices).
-- Run once in Supabase SQL Editor.
-- Photos use the existing valve-attachments storage bucket under received-valves/.

begin;

create table if not exists public.received_valves (
  id uuid primary key,
  received_date date not null default current_date,
  customer text not null default '',
  description text not null default '',
  teardown_inspection_date date,
  warehouse_check_in_date date,
  estimate_number text not null default '',
  sales_order_number text not null default '',
  work_order_printed boolean not null default false,
  status text not null default 'waiting_on_salesman'
    check (
      status in (
        'waiting_on_salesman',
        'waiting_on_customer',
        'quoted',
        'converted',
        'lost'
      )
    ),
  image_url text,
  image_storage_path text,
  image_name text,
  sent_to_rfq_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_received_valves_received_date
  on public.received_valves (received_date desc, created_at desc);

create index if not exists idx_received_valves_status
  on public.received_valves (status);

alter table public.received_valves enable row level security;

drop policy if exists "authenticated read received valves" on public.received_valves;
create policy "authenticated read received valves"
on public.received_valves
for select
to authenticated
using (true);

drop policy if exists "authenticated insert received valves" on public.received_valves;
create policy "authenticated insert received valves"
on public.received_valves
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update received valves" on public.received_valves;
create policy "authenticated update received valves"
on public.received_valves
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete received valves" on public.received_valves;
create policy "authenticated delete received valves"
on public.received_valves
for delete
to authenticated
using (true);

commit;
