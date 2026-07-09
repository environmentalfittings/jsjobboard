-- Optional photos attached when resolving feedback (up to 3).

alter table public.app_feedback
  add column if not exists resolution_images jsonb not null default '[]'::jsonb;
