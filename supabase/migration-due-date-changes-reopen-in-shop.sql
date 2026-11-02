-- Re-open bulk-closed due date changes for jobs still in the shop (not Completed)
-- so they appear on the dashboard queue again. Completed jobs stay closed.
-- Cutoff: changes on/before 2026-11-02 (America/Chicago). Run once in Supabase.

begin;

update public.due_date_changes d
set
  customer_response = null,
  customer_response_comment = null,
  customer_response_at = null,
  customer_response_by_name = null
from public.valves v
where d.valve_row_id = v.id
  and d.customer_response is not null
  and d.customer_response_by_name = 'System'
  and d.customer_response_comment ilike 'Closed as completed / historical%'
  and d.changed_at <= '2026-11-03T05:59:59.999Z'
  and coalesce(v.status, '') <> 'Completed'
  and coalesce(v.order_type, '') <> 'Completed';

commit;
