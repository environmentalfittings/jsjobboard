-- Track when the submitter was notified in Messages after feedback was resolved.

alter table public.app_feedback
  add column if not exists resolution_notified_at timestamptz;
