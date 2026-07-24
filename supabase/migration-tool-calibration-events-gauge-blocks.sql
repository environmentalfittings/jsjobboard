-- Add gauge block set traceability fields to tool_calibration_events.
-- Safe to run if migration-tool-calibration-events.sql was already applied without these columns.

begin;

alter table public.tool_calibration_events
  add column if not exists gauge_block_serial text;

alter table public.tool_calibration_events
  add column if not exists gauge_block_next_due date;

commit;
