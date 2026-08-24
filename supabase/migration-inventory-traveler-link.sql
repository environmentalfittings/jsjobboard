-- Customer inventory: optional external link to traveler / MTR (SharePoint, etc.).
-- Safe to re-run.

alter table public.inventory
  add column if not exists traveler_link text;

comment on column public.inventory.traveler_link is
  'Optional URL to an external traveler or MTR (in addition to uploaded PDF)';
