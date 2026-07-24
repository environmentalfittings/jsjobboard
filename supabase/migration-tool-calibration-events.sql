-- In-house recalibration events for tool_calibrations (SOP 2010).
-- Run in Supabase SQL Editor after migration-tool-calibrations.sql.

begin;

create table if not exists public.tool_calibration_events (
  id uuid primary key default gen_random_uuid(),
  tool_id bigint not null references public.tool_calibrations (id) on delete cascade,
  calibrated_at date not null,
  next_due_at date not null,
  tech_initials text not null,
  technician_id bigint,
  technician_name text,
  signed_off_at date,
  ambient_temp_f numeric(5, 1),
  gauge_block_serial text,
  gauge_block_next_due date,
  procedure_ref text not null default 'SOP 2010',
  result text not null check (result in ('pass', 'fail')),
  notes text,
  measurements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_calibration_events_tool_id
  on public.tool_calibration_events (tool_id);

create index if not exists idx_tool_calibration_events_calibrated_at
  on public.tool_calibration_events (calibrated_at desc);

alter table public.tool_calibration_events enable row level security;

drop policy if exists "public read tool calibration events" on public.tool_calibration_events;
create policy "public read tool calibration events"
on public.tool_calibration_events for select using (true);

drop policy if exists "authenticated insert tool calibration events" on public.tool_calibration_events;
create policy "authenticated insert tool calibration events"
on public.tool_calibration_events for insert to authenticated with check (true);

drop policy if exists "authenticated update tool calibration events" on public.tool_calibration_events;
create policy "authenticated update tool calibration events"
on public.tool_calibration_events for update to authenticated using (true) with check (true);

drop policy if exists "authenticated delete tool calibration events" on public.tool_calibration_events;
create policy "authenticated delete tool calibration events"
on public.tool_calibration_events for delete to authenticated using (true);

drop policy if exists "anon insert tool calibration events" on public.tool_calibration_events;
create policy "anon insert tool calibration events"
on public.tool_calibration_events for insert to anon with check (true);

drop policy if exists "anon update tool calibration events" on public.tool_calibration_events;
create policy "anon update tool calibration events"
on public.tool_calibration_events for update to anon using (true) with check (true);

drop policy if exists "anon delete tool calibration events" on public.tool_calibration_events;
create policy "anon delete tool calibration events"
on public.tool_calibration_events for delete to anon using (true);

commit;
