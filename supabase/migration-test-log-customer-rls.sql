-- Customer portal read access for test logs and attached test reports.
-- Run when exposing test data on the customer traveler / valve completion report.
-- Matches the valve_id scoping pattern in migration-customer-portal-traveler-rls.sql.

begin;

-- Replace broad public read with role-scoped access (shop staff + own-customer portal users).
drop policy if exists "public read test logs" on public.test_logs;
drop policy if exists "public write test logs" on public.test_logs;
drop policy if exists "public read test log reports" on public.test_log_reports;
drop policy if exists "public write test log reports" on public.test_log_reports;

drop policy if exists "test_logs_internal_full_access" on public.test_logs;
create policy "test_logs_internal_full_access"
  on public.test_logs
  for all
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  )
  with check (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  );

drop policy if exists "test_logs_customer_select_own" on public.test_logs;
create policy "test_logs_customer_select_own"
  on public.test_logs
  for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id
      from public.traveler_basic_info bi
      where bi.customer = (
        select cpu.customer_name
        from public.customer_portal_users cpu
        where cpu.auth_user_id = auth.uid()
        limit 1
      )
    )
  );

drop policy if exists "test_log_reports_internal_full_access" on public.test_log_reports;
create policy "test_log_reports_internal_full_access"
  on public.test_log_reports
  for all
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  )
  with check (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  );

drop policy if exists "test_log_reports_customer_select_own" on public.test_log_reports;
create policy "test_log_reports_customer_select_own"
  on public.test_log_reports
  for select
  to authenticated
  using (
    test_log_id in (
      select tl.id
      from public.test_logs tl
      where tl.valve_id in (
        select bi.valve_id
        from public.traveler_basic_info bi
        where bi.customer = (
          select cpu.customer_name
          from public.customer_portal_users cpu
          where cpu.auth_user_id = auth.uid()
          limit 1
        )
      )
    )
  );

commit;
