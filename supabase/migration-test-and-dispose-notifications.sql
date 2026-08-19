-- Allow Test and Dispose warehouse alerts in Messages (direct-insert fallback path).
-- Safe to re-run. send_app_notifications RPC works without this policy update.

drop policy if exists "messages_insert_notification_authenticated" on public.app_messages;
create policy "messages_insert_notification_authenticated"
on public.app_messages
for insert
to authenticated
with check (
  category = 'notification'
  and sender_user_id = auth.uid()
  and recipient_user_id is not null
  and notification_kind in (
    'itp_item_flagged',
    'itp_qc_review_requested',
    'itp_flag_resolved',
    'feedback_resolved',
    'customer_inventory_monthly_report',
    'test_and_dispose_ready'
  )
);
