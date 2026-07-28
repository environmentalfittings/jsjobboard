-- Fix: Mike Dunn sees 0 Messages while app_messages has 137 rows.
-- Cause: mail is still attached to an old Brian/bdunn Auth UUID, or
-- employees.auth_user_id != technicians.user_id for mdunn.
--
-- Run in a NEW blank Supabase SQL query. Safe to re-run.

-- A) Inspect Dunn rows first
select 'employee' as src, e.full_name as name, e.username as login, e.auth_user_id::text as auth_id
from public.employees e
where lower(coalesce(e.username, '')) in ('mdunn', 'bdunn')
   or lower(coalesce(e.full_name, '')) like '%dunn%'
union all
select 'technician', t.name, t.login_username, t.user_id::text
from public.technicians t
where lower(coalesce(t.login_username, '')) in ('mdunn', 'bdunn')
   or lower(coalesce(t.name, '')) like '%dunn%';

-- B) Repair: point everything at the shop login Auth ID (technicians.user_id)
do $$
declare
  v_tech uuid;
  v_emp uuid;
  v_live uuid;
  r record;
  v_rec bigint;
  v_send bigint;
begin
  select user_id into v_tech
  from public.technicians
  where lower(login_username) = 'mdunn'
  order by active desc nulls last
  limit 1;

  select auth_user_id into v_emp
  from public.employees
  where lower(username) = 'mdunn'
  limit 1;

  -- Prefer technician link (this is what shop login uses)
  v_live := coalesce(v_tech, v_emp);

  if v_live is null then
    raise exception 'mdunn has no Auth link on technicians.user_id or employees.auth_user_id';
  end if;

  -- Keep Employees roster on the same Auth user as the shop login
  update public.employees
  set auth_user_id = v_live
  where lower(username) = 'mdunn'
    and (auth_user_id is distinct from v_live);

  -- If technician was missing a link but employee had one, link technician too
  update public.technicians
  set user_id = v_live
  where lower(login_username) = 'mdunn'
    and (user_id is distinct from v_live);

  -- Remap mail from EVERY other Dunn-related Auth user onto the live login
  for r in
    select u.id as old_id
    from auth.users u
    where u.id <> v_live
      and (
        lower(u.email) like '%dunn%'
        or lower(u.email) like '%bdunn%'
        or lower(u.email) like '%mdunn%'
        or lower(coalesce(u.raw_user_meta_data->>'username', '')) in ('bdunn', 'mdunn')
        or lower(coalesce(u.raw_user_meta_data->>'full_name', '')) like '%dunn%'
      )
    union
    -- Also remap the non-live Dunn link if employee/tech pointed at different IDs
    select x.old_id
    from (
      select v_emp as old_id
      union all
      select v_tech
    ) x
    where x.old_id is not null
      and x.old_id <> v_live
  loop
    update public.app_messages
    set recipient_user_id = v_live
    where recipient_user_id = r.old_id;
    get diagnostics v_rec = row_count;

    update public.app_messages
    set sender_user_id = v_live
    where sender_user_id = r.old_id;
    get diagnostics v_send = row_count;

    raise notice 'Remapped % -> % (recipient=%, sender=%)', r.old_id, v_live, v_rec, v_send;
  end loop;

  -- Un-hide anything soft-deleted for this login
  update public.app_messages
  set recipient_deleted_at = null
  where recipient_user_id = v_live
    and recipient_deleted_at is not null;

  update public.app_messages
  set sender_deleted_at = null
  where sender_user_id = v_live
    and sender_deleted_at is not null;

  raise notice 'Live mdunn auth id = %', v_live;
end $$;

-- C) Verify counts for live mdunn login
with live as (
  select coalesce(
    (select user_id from public.technicians where lower(login_username) = 'mdunn' and user_id is not null limit 1),
    (select auth_user_id from public.employees where lower(username) = 'mdunn' and auth_user_id is not null limit 1)
  ) as auth_id
)
select
  live.auth_id::text as live_mdunn_auth_id,
  (select count(*) from public.app_messages m where m.recipient_user_id = live.auth_id) as inbox_rows,
  (select count(*) from public.app_messages m where m.sender_user_id = live.auth_id) as sent_rows,
  (select count(*) from public.app_messages m
    where m.recipient_user_id = live.auth_id
      and m.recipient_archived_at is not null
      and coalesce(m.recipient_deleted_at is null, true)) as archived_rows
from live;
