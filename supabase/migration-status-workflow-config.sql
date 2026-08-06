-- Editable shop workflow for rework / backward-status detection.
-- Run once in Supabase SQL Editor.
-- Manage Lists → Shop workflow can change stage order and status mapping after this.

begin;

create table if not exists public.status_workflow_config (
  id integer primary key check (id = 1),
  stages jsonb not null,
  neutrals text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

alter table public.status_workflow_config enable row level security;

drop policy if exists "public read status workflow config" on public.status_workflow_config;
create policy "public read status workflow config"
on public.status_workflow_config
for select
to anon, authenticated
using (true);

drop policy if exists "public upsert status workflow config" on public.status_workflow_config;
create policy "public upsert status workflow config"
on public.status_workflow_config
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update status workflow config" on public.status_workflow_config;
create policy "public update status workflow config"
on public.status_workflow_config
for update
to anon, authenticated
using (true)
with check (true);

-- Seed defaults if empty (matches app DEFAULT_STATUS_WORKFLOW).
insert into public.status_workflow_config (id, stages, neutrals)
values (
  1,
  '[
    {"key":"pull","label":"Pull / incoming","statuses":["Pull from Customer Yard","Pull from Warehouse","Pull from JS Yard","Coming in from Vendor","Coming in from Customer","Not Arrived","Arrived - Not Started"]},
    {"key":"teardown","label":"Teardown","statuses":["Teardown","PRV Teardown"]},
    {"key":"machine_1","label":"Machine 1","statuses":["Machine 1"]},
    {"key":"welding","label":"Welding","statuses":["Welding"]},
    {"key":"machine_2","label":"Machine 2","statuses":["Machine 2","Water Jet","Grinding"]},
    {"key":"fitting","label":"Fitting","statuses":["Fitting"]},
    {"key":"assembly","label":"Assembly","statuses":["Assembly","PRV Assembly"]},
    {"key":"adaption","label":"Adaption","statuses":["Adaption"]},
    {"key":"actuation","label":"Actuation","statuses":["Actuation"]},
    {"key":"testing","label":"Testing","statuses":["Testing"]},
    {"key":"painting","label":"Painting","statuses":["Painting"]},
    {"key":"warehouse_rts","label":"Warehouse RTS","statuses":["Warehouse RTS"]},
    {"key":"completed","label":"Completed","statuses":["Completed"]}
  ]'::jsonb,
  array[
    'Waiting on Parts',
    'Waiting on Customer',
    'Waiting on Salesman',
    'Outsourced',
    'On Hold',
    'Replaced',
    'Junked'
  ]::text[]
)
on conflict (id) do nothing;

commit;
