-- Add notes to received valves.
-- Run once in Supabase SQL Editor.

begin;

alter table public.received_valves
  add column if not exists notes text not null default '';

commit;
