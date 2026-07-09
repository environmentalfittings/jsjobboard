-- Restore valves incorrectly reopened by the 2026-07-06 job-board auto-repair.
-- Prefer: node scripts/restore-bulk-valve-repair.mjs "path/to/Valve Status.xlsx"
-- This SQL is a fallback when no workbook is available (date_closed may stay null).

update public.valves
set
  order_type = 'Completed',
  date_closed = coalesce(date_closed, date_tested)
where order_type = 'In-Process Order'
  and date_closed is null
  and created_at < '2026-07-06'::timestamptz
  and updated_at >= '2026-07-06 17:29:00+00'::timestamptz
  and updated_at <= '2026-07-06 18:35:00+00'::timestamptz;
