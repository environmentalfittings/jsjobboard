-- Diagnose Dan White ITP review / flag alerts in Messages.
-- Run in a NEW blank Supabase SQL query (bypasses RLS).

-- 1) Dan's roster + shop login Auth links (must match)
select
  'employee' as source,
  e.id::text as row_id,
  e.full_name as name,
  e.username as login_username,
  e.auth_user_id::text as auth_user_id,
  e.quality_team_level::text as level_or_role
from public.employees e
where lower(coalesce(e.username, '')) = 'dwhite'
   or lower(coalesce(e.full_name, '')) like '%dan%white%'

union all

select
  'technician',
  t.id::text,
  t.name,
  t.login_username,
  t.user_id::text,
  t.role
from public.technicians t
where lower(coalesce(t.login_username, '')) = 'dwhite'
   or lower(coalesce(t.name, '')) like '%dan%white%';

-- 2) Confirm notification RPC exists
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'send_app_notifications';

-- 3) Dan inbox totals (by Employees auth_user_id)
with dan as (
  select auth_user_id as auth_id
  from public.employees
  where lower(username) = 'dwhite'
  limit 1
)
select
  count(*) as total_inbox,
  count(*) filter (where category = 'notification') as notifications,
  count(*) filter (where notification_kind = 'itp_qc_review_requested') as itp_review_alerts,
  count(*) filter (where notification_kind = 'itp_item_flagged') as itp_flag_alerts,
  count(*) filter (where read_at is null and recipient_archived_at is null) as unread_active
from public.app_messages m
join dan on m.recipient_user_id = dan.auth_id;

-- 4) Latest ITP review alerts for Dan
with dan as (
  select auth_user_id as auth_id
  from public.employees
  where lower(username) = 'dwhite'
  limit 1
)
select
  m.id,
  m.created_at,
  m.subject,
  m.notification_kind,
  m.read_at,
  m.recipient_archived_at,
  m.sender_name
from public.app_messages m
join dan on m.recipient_user_id = dan.auth_id
where m.notification_kind in ('itp_qc_review_requested', 'itp_item_flagged')
order by m.created_at desc
limit 25;

-- 5) Recent pending-review ITPs and whether the app thinks it notified
select
  v.valve_id,
  vi.valve_row_id,
  vi.updated_at,
  vi.itp_data #>> '{qcReview,status}' as qc_status,
  vi.itp_data #>> '{qcReview,generatedAt}' as generated_at,
  vi.itp_data #>> '{qcReview,notifiedAt}' as notified_at,
  vi.itp_data #>> '{qcReview,generatedByName}' as generated_by,
  case
    when vi.itp_data ? 'bundle' then vi.itp_data #>> '{libraryPlan,qcReview,status}'
    else vi.itp_data #>> '{qcReview,status}'
  end as status_any
from public.valve_itp vi
join public.valves v on v.id = vi.valve_row_id
where coalesce(
  vi.itp_data #>> '{qcReview,status}',
  vi.itp_data #>> '{libraryPlan,qcReview,status}'
) = 'pending_review'
order by vi.updated_at desc
limit 20;
