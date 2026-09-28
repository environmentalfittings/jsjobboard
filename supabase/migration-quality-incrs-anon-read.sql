-- Allow dashboard rework-queue enrichment without a Supabase Auth session.
-- Generic Admin / read-only local bypass uses the anon key; without this policy
-- attachIncrStatuses cannot load status and open INCRs never appear on the queue.
-- Run once in Supabase SQL Editor.

begin;

drop policy if exists "anon read quality incrs" on public.quality_incrs;
create policy "anon read quality incrs"
on public.quality_incrs
for select
to anon
using (true);

commit;
