-- Expand test_gauges into a calibrated gauge registry for test log dropdowns.
begin;

alter table public.test_gauges
  add column if not exists gauge_number text,
  add column if not exists manufacturer text,
  add column if not exists last_calibration_date date,
  add column if not exists next_calibration_date date,
  add column if not exists certificate_storage_path text,
  add column if not exists certificate_file_name text,
  add column if not exists certificate_mime_type text,
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now();

-- Legacy column gauge_id held the gauge number (e.g. JS284).
update public.test_gauges
set gauge_number = gauge_id
where gauge_number is null and gauge_id is not null;

-- Keep one row per gauge number (old seed had Low/High/Shell duplicates).
delete from public.test_gauges a
using public.test_gauges b
where a.gauge_number = b.gauge_number
  and a.gauge_number is not null
  and a.ctid < b.ctid;

create unique index if not exists test_gauges_gauge_number_unique
  on public.test_gauges (gauge_number)
  where gauge_number is not null;

alter table public.test_gauges enable row level security;

drop policy if exists "public read test gauges" on public.test_gauges;
create policy "public read test gauges"
on public.test_gauges for select using (true);

drop policy if exists "authenticated insert test gauges" on public.test_gauges;
create policy "authenticated insert test gauges"
on public.test_gauges for insert to authenticated with check (true);

drop policy if exists "authenticated update test gauges" on public.test_gauges;
create policy "authenticated update test gauges"
on public.test_gauges for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete test gauges" on public.test_gauges;
create policy "authenticated delete test gauges"
on public.test_gauges for delete to authenticated using (true);

commit;
