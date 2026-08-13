-- 5 Whys root-cause rows on quality INCRs (jsonb text array).
-- Run in Supabase SQL Editor.

alter table public.quality_incrs
  add column if not exists five_whys jsonb not null default '["","","","",""]'::jsonb;
