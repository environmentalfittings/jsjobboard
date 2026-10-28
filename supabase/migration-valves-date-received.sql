-- Demand / receipt date on work orders (valves).
-- Reports use COALESCE(date_received, due_date) as the demand date.
-- Run once in the Supabase SQL Editor.

begin;

alter table public.valves
  add column if not exists date_received date;

comment on column public.valves.date_received is
  'When the valve/job was received (demand date). New app jobs default to creation day; editable on the job form. Reports fall back to due_date when null.';

-- Default new rows to the calendar day of created_at when the app omits the column.
create or replace function public.valves_default_date_received()
returns trigger
language plpgsql
as $$
begin
  if new.date_received is null then
    new.date_received := coalesce(new.created_at::date, current_date);
  end if;
  return new;
end;
$$;

drop trigger if exists valves_default_date_received on public.valves;
create trigger valves_default_date_received
before insert on public.valves
for each row
execute function public.valves_default_date_received();

create index if not exists idx_valves_date_received
  on public.valves (date_received desc nulls last);

create index if not exists idx_valves_demand_date
  on public.valves (coalesce(date_received, due_date) desc nulls last);

commit;
