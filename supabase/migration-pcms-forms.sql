-- PCMS / RV-1958 form drafts saved per job (shared across technicians).
-- Run once in the Supabase SQL Editor after deploy.

begin;

create table if not exists public.pcms_forms (
  valve_row_id integer primary key references public.valves (id) on delete cascade,
  form_data jsonb not null default '{}'::jsonb,
  updated_by_user_id uuid,
  updated_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pcms_forms_updated_at
  on public.pcms_forms (updated_at desc);

create or replace function public.set_pcms_forms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pcms_forms_set_updated_at on public.pcms_forms;
create trigger pcms_forms_set_updated_at
before update on public.pcms_forms
for each row
execute function public.set_pcms_forms_updated_at();

alter table public.pcms_forms enable row level security;

drop policy if exists "public read pcms forms" on public.pcms_forms;
create policy "public read pcms forms"
on public.pcms_forms
for select
to anon, authenticated
using (true);

drop policy if exists "public insert pcms forms" on public.pcms_forms;
create policy "public insert pcms forms"
on public.pcms_forms
for insert
to anon, authenticated
with check (true);

drop policy if exists "public update pcms forms" on public.pcms_forms;
create policy "public update pcms forms"
on public.pcms_forms
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public delete pcms forms" on public.pcms_forms;
create policy "public delete pcms forms"
on public.pcms_forms
for delete
to anon, authenticated
using (true);

grant select, insert, update, delete on public.pcms_forms to anon, authenticated;

comment on table public.pcms_forms is
  'Shared PCMS / RV-1958 form JSON keyed by valves.id (one draft per job).';

commit;
