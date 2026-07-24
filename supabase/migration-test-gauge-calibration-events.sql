-- External calibration certificates + archive history for test gauges.
-- Run in Supabase SQL Editor.

begin;

alter table public.test_gauges
  add column if not exists certificate_number text;

create table if not exists public.test_gauge_calibration_events (
  id uuid primary key default gen_random_uuid(),
  gauge_id uuid not null references public.test_gauges (id) on delete cascade,
  calibrated_at date not null,
  next_due_at date not null,
  tech_initials text not null,
  technician_id bigint,
  technician_name text,
  signed_off_at date,
  procedure_ref text not null default 'External lab certificate',
  result text not null default 'pass' check (result in ('pass', 'fail')),
  notes text,
  certificate_number text,
  certificate_storage_path text,
  certificate_file_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_test_gauge_calibration_events_gauge_id
  on public.test_gauge_calibration_events (gauge_id);

create index if not exists idx_test_gauge_calibration_events_calibrated_at
  on public.test_gauge_calibration_events (calibrated_at desc);

alter table public.test_gauge_calibration_events enable row level security;

drop policy if exists "public read test gauge calibration events" on public.test_gauge_calibration_events;
create policy "public read test gauge calibration events"
on public.test_gauge_calibration_events for select using (true);

drop policy if exists "authenticated insert test gauge calibration events" on public.test_gauge_calibration_events;
create policy "authenticated insert test gauge calibration events"
on public.test_gauge_calibration_events for insert to authenticated with check (true);

drop policy if exists "authenticated update test gauge calibration events" on public.test_gauge_calibration_events;
create policy "authenticated update test gauge calibration events"
on public.test_gauge_calibration_events for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete test gauge calibration events" on public.test_gauge_calibration_events;
create policy "authenticated delete test gauge calibration events"
on public.test_gauge_calibration_events for delete to authenticated using (true);

drop policy if exists "anon insert test gauge calibration events" on public.test_gauge_calibration_events;
create policy "anon insert test gauge calibration events"
on public.test_gauge_calibration_events for insert to anon with check (true);

drop policy if exists "anon update test gauge calibration events" on public.test_gauge_calibration_events;
create policy "anon update test gauge calibration events"
on public.test_gauge_calibration_events for update to anon using (true) with check (true);

drop policy if exists "anon delete test gauge calibration events" on public.test_gauge_calibration_events;
create policy "anon delete test gauge calibration events"
on public.test_gauge_calibration_events for delete to anon using (true);

commit;
