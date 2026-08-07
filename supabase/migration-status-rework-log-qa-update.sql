-- Allow QA follow-up updates on rework rows (NA / INCR / reopen).
-- Also ensures disposition columns exist. Run once in Supabase SQL Editor.

begin;

alter table public.status_rework_log
  add column if not exists qa_disposition text;

alter table public.status_rework_log
  add column if not exists incr_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'status_rework_log_qa_disposition_check'
  ) then
    alter table public.status_rework_log
      add constraint status_rework_log_qa_disposition_check
      check (qa_disposition is null or qa_disposition in ('na', 'incr'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'status_rework_log_incr_id_fkey'
  ) then
    alter table public.status_rework_log
      add constraint status_rework_log_incr_id_fkey
      foreign key (incr_id) references public.quality_incrs (id) on delete set null;
  end if;
end $$;

create index if not exists idx_status_rework_log_incr_id
  on public.status_rework_log (incr_id);

drop policy if exists "authenticated update status rework log" on public.status_rework_log;
create policy "authenticated update status rework log"
on public.status_rework_log
for update
to authenticated
using (true)
with check (true);

drop policy if exists "public update status rework log" on public.status_rework_log;
create policy "public update status rework log"
on public.status_rework_log
for update
to anon, authenticated
using (true)
with check (true);

commit;
