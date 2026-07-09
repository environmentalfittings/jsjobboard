-- Structured testing layout for test log entries (API procedure, pressure tests, etc.)
alter table public.test_logs
  add column if not exists testing_details jsonb;
