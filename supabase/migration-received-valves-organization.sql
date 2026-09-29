-- Scope received_valves to a company (JS Valve / VSI).
-- Run once in Supabase SQL Editor after migration-organizations-foundation.sql.
-- Untagged historical rows are assigned to JS Valve.

begin;

alter table public.received_valves
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_received_valves_organization_id
  on public.received_valves (organization_id);

-- Existing log entries belong to JS Valve.
update public.received_valves rv
set organization_id = o.id
from public.organizations o
where o.slug = 'js-valve'
  and rv.organization_id is null;

comment on column public.received_valves.organization_id is
  'Company that owns this received-valve log entry (JS Valve / VSI).';

commit;
