-- Add Requires Corporate NCR flag on quality INCRs.
-- Run once in Supabase SQL Editor.

alter table public.quality_incrs
  add column if not exists requires_corporate_ncr boolean not null default false;
