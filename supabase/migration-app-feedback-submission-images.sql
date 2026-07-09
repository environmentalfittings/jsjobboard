-- Optional screenshots attached when users submit feedback (up to 3).

alter table public.app_feedback
  add column if not exists submission_images jsonb not null default '[]'::jsonb;
