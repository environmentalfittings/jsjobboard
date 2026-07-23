-- Allow department-based daily priority queues (Receiving, Teardown, Machine shop, …).
-- Run in Supabase SQL Editor after migration-status-priority-queue.sql.

alter table public.status_priority_queue drop constraint if exists status_priority_queue_scope_kind_check;
alter table public.status_priority_queue
  add constraint status_priority_queue_scope_kind_check
  check (scope_kind in ('status', 'cell', 'department'));
