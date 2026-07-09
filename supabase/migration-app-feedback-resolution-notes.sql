-- Admin notes on how each feedback item was resolved.

alter table public.app_feedback
  add column if not exists resolution_notes text;
