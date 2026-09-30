-- Scope valves (job cards) to a company (JS Valve / VSI).
-- Run once in Supabase SQL Editor after migration-organizations-foundation.sql.
-- Untagged historical rows are assigned to JS Valve.

begin;

alter table public.valves
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_valves_organization_id
  on public.valves (organization_id);

-- Existing job cards belong to JS Valve.
update public.valves v
set organization_id = o.id
from public.organizations o
where o.slug = 'js-valve'
  and v.organization_id is null;

comment on column public.valves.organization_id is
  'Company that owns this job card (JS Valve / VSI).';

commit;
