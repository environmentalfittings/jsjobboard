-- Allow any signed-in shop user to send ITP / Quality Team notification messages.
-- Previously only JWT/profile Admin could insert category = 'notification', so
-- technician flags never reached Quality Team inboxes.
-- Prefer migration-app-messages-send-notifications-rpc.sql (policy + RPC).
--
-- Run in Supabase SQL Editor. Safe to re-run.

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
    'feedback_resolved'
  )
);

-- Keep the older admin policy for any other notification kinds, if present.
-- (No change required if it already exists.)
