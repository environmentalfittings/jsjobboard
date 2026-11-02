-- Close legacy / pre-feature due date changes that are clogging the dashboard
-- pending queue. New structured changes (reason_code set) stay open until a
-- real Approved / Cancelled / Other response is recorded in the app.
-- Run once in Supabase SQL Editor.

begin;

update public.due_date_changes
set
  customer_response = 'Other',
  customer_response_comment = 'Closed as completed / historical — cleared from dashboard pending list (bulk close).',
  customer_response_at = now(),
  customer_response_by_name = 'System'
where customer_response is null
  and reason_code is null;

commit;
