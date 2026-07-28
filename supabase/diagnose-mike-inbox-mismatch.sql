-- Why Mike sees 0 messages while app_messages has rows.
-- Run in Supabase SQL Editor. Paste results back if needed.

-- A) Mike's current linked Auth IDs
select 'employee' as src, e.full_name, e.username, e.auth_user_id::text as auth_id
from public.employees e
where lower(coalesce(e.full_name,'')) like '%dunn%'
   or lower(coalesce(e.username,'')) like '%dunn%'
   or lower(coalesce(e.username,'')) = 'mdunn'
union all
select 'technician', t.name, t.login_username, t.user_id::text
from public.technicians t
where lower(coalesce(t.name,'')) like '%dunn%'
   or lower(coalesce(t.login_username,'')) like '%dunn%'
   or lower(coalesce(t.login_username,'')) = 'mdunn';

-- B) Auth users matching Dunn / mdunn
select id::text, email, created_at, last_sign_in_at
from auth.users
where lower(email) like '%dunn%'
   or lower(email) like '%mdunn%'
   or lower(coalesce(raw_user_meta_data->>'username','')) like '%dunn%'
   or lower(coalesce(raw_user_meta_data->>'full_name','')) like '%dunn%'
order by last_sign_in_at desc nulls last;

-- C) How many of the 137 are tied to Mike's CURRENT employee auth_user_id
select
  count(*) filter (
    where m.recipient_user_id = e.auth_user_id
      or m.sender_user_id = e.auth_user_id
  ) as tied_to_current_auth,
  count(*) filter (
    where m.recipient_user_id = e.auth_user_id
      and m.recipient_deleted_at is null
  ) as inbox_visible_if_rls_ok,
  count(*) filter (
    where m.recipient_user_id = e.auth_user_id
      and m.recipient_archived_at is not null
      and m.recipient_deleted_at is null
  ) as archived_for_current_auth
from public.app_messages m
cross join lateral (
  select auth_user_id
  from public.employees
  where lower(coalesce(full_name,'')) like '%dunn%'
     or lower(coalesce(username,'')) = 'mdunn'
  order by is_active desc nulls last
  limit 1
) e;

-- D) Top recipient Auth IDs in the table (find orphaned old Mike IDs)
select
  m.recipient_user_id::text as recipient_id,
  u.email,
  count(*) as msgs,
  count(*) filter (where m.recipient_archived_at is not null) as archived
from public.app_messages m
left join auth.users u on u.id = m.recipient_user_id
group by m.recipient_user_id, u.email
order by msgs desc
limit 25;
