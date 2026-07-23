-- Multi-technician handout assignments on daily priority rows.
-- Run in Supabase SQL Editor.

alter table public.status_priority_queue
  add column if not exists assigned_technician_ids bigint[] not null default '{}';

-- Copy any single-tech assignments into the array.
update public.status_priority_queue
set assigned_technician_ids = array[assigned_technician_id]
where assigned_technician_id is not null
  and (
    assigned_technician_ids is null
    or cardinality(assigned_technician_ids) = 0
  );
