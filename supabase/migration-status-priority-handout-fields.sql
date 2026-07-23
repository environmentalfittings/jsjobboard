-- Handout-only technician + notes on daily priority rows.
-- Also ensure department is allowed as scope_kind.
-- Run in Supabase SQL Editor.

alter table public.status_priority_queue drop constraint if exists status_priority_queue_scope_kind_check;
alter table public.status_priority_queue
  add constraint status_priority_queue_scope_kind_check
  check (scope_kind in ('status', 'cell', 'department'));

alter table public.status_priority_queue
  add column if not exists assigned_technician_id bigint references public.technicians (id) on delete set null;

alter table public.status_priority_queue
  add column if not exists handout_notes text;
