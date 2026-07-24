-- Add category to tool_calibrations (MTE type grouping).
-- Run in Supabase SQL Editor after migration-tool-calibrations.sql.

alter table public.tool_calibrations
  add column if not exists category text;

create index if not exists idx_tool_calibrations_category
  on public.tool_calibrations (category);

-- Best-effort backfill from existing tool_type / model text.
update public.tool_calibrations
set category = case
  when category is not null and btrim(category) <> '' then category
  when coalesce(tool_type, '') ~* 'caliper' then 'Calipers'
  when coalesce(tool_type, '') ~* 'micrometer' or coalesce(model, '') ~* '\bmic\b' then 'Micrometer'
  when coalesce(tool_type, '') ~* 'dial\s*indicator' or coalesce(model, '') ~* 'dial\s*indicator' then 'Dial Indicator'
  when coalesce(tool_type, '') ~* 'torque' then 'Torque Wrenches'
  when coalesce(tool_type, '') ~* 'load\s*cell' then 'Load Cells'
  when coalesce(tool_type, '') ~* 'thickness' then 'Thickness Tester'
  when coalesce(tool_type, '') ~* 'dead\s*weight' then 'Dead Weight Tester'
  when coalesce(tool_type, '') ~* 'helium' then 'Helium Leak Standard'
  when coalesce(tool_type, '') ~* 'gauge\s*block' then 'Gauge Block Standard'
  when coalesce(tool_type, '') ~* 'chart\s*recorder|heat\s*treat' then 'Heat Treat Chart Recorder'
  when coalesce(tool_type, '') ~* 'welder\s*load' then 'Welder Load Test'
  when coalesce(tool_type, '') ~* 'gauge|pressure' then 'Gauges'
  else null
end
where category is null or btrim(category) = '';
