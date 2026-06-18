-- Customer portal read policies for traveler tables.
-- Run in Supabase SQL Editor.

begin;

alter table public.customer_portal_users enable row level security;
alter table public.travelers enable row level security;
alter table public.traveler_basic_info enable row level security;
alter table public.traveler_valve_selection enable row level security;
alter table public.traveler_valve_specs enable row level security;
alter table public.traveler_welding enable row level security;
alter table public.traveler_other_parts enable row level security;
alter table public.traveler_parts_ordered enable row level security;
alter table public.traveler_testing_qc enable row level security;
alter table public.traveler_attachments enable row level security;

-- Customer portal users can read only their own mapping row.
drop policy if exists "customer_portal_users_self_select" on public.customer_portal_users;
create policy "customer_portal_users_self_select"
  on public.customer_portal_users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- Internal users (shop roles) can manage portal user rows.
drop policy if exists "customer_portal_users_internal_full_access" on public.customer_portal_users;
create policy "customer_portal_users_internal_full_access"
  on public.customer_portal_users
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

-- Replace broad authenticated policies with internal-role-only policies.
drop policy if exists "staff_full_access_travelers" on public.travelers;
drop policy if exists "staff_full_access_basic_info" on public.traveler_basic_info;
drop policy if exists "staff_full_access_testing_qc" on public.traveler_testing_qc;
drop policy if exists "staff_full_access_attachments" on public.traveler_attachments;
drop policy if exists "customer_read_own_travelers" on public.traveler_basic_info;

drop policy if exists "traveler_internal_full_access" on public.travelers;
create policy "traveler_internal_full_access"
  on public.travelers
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

drop policy if exists "traveler_basic_info_internal_full_access" on public.traveler_basic_info;
create policy "traveler_basic_info_internal_full_access"
  on public.traveler_basic_info
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

drop policy if exists "traveler_valve_selection_internal_full_access" on public.traveler_valve_selection;
create policy "traveler_valve_selection_internal_full_access"
  on public.traveler_valve_selection
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

drop policy if exists "traveler_valve_specs_internal_full_access" on public.traveler_valve_specs;
create policy "traveler_valve_specs_internal_full_access"
  on public.traveler_valve_specs
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

drop policy if exists "traveler_welding_internal_full_access" on public.traveler_welding;
create policy "traveler_welding_internal_full_access"
  on public.traveler_welding
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

drop policy if exists "traveler_other_parts_internal_full_access" on public.traveler_other_parts;
create policy "traveler_other_parts_internal_full_access"
  on public.traveler_other_parts
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

drop policy if exists "traveler_parts_ordered_internal_full_access" on public.traveler_parts_ordered;
create policy "traveler_parts_ordered_internal_full_access"
  on public.traveler_parts_ordered
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

drop policy if exists "traveler_testing_qc_internal_full_access" on public.traveler_testing_qc;
create policy "traveler_testing_qc_internal_full_access"
  on public.traveler_testing_qc
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

drop policy if exists "traveler_attachments_internal_full_access" on public.traveler_attachments;
create policy "traveler_attachments_internal_full_access"
  on public.traveler_attachments
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

-- Customer read-only access for own jobs.
drop policy if exists "traveler_customer_select_own" on public.travelers;
create policy "traveler_customer_select_own"
  on public.travelers
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

drop policy if exists "traveler_basic_info_customer_select_own" on public.traveler_basic_info;
create policy "traveler_basic_info_customer_select_own"
  on public.traveler_basic_info
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

drop policy if exists "traveler_valve_selection_customer_select_own" on public.traveler_valve_selection;
create policy "traveler_valve_selection_customer_select_own"
  on public.traveler_valve_selection
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

drop policy if exists "traveler_valve_specs_customer_select_own" on public.traveler_valve_specs;
create policy "traveler_valve_specs_customer_select_own"
  on public.traveler_valve_specs
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

drop policy if exists "traveler_welding_customer_select_own" on public.traveler_welding;
create policy "traveler_welding_customer_select_own"
  on public.traveler_welding
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

drop policy if exists "traveler_other_parts_customer_select_own" on public.traveler_other_parts;
create policy "traveler_other_parts_customer_select_own"
  on public.traveler_other_parts
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

drop policy if exists "traveler_parts_ordered_customer_select_own" on public.traveler_parts_ordered;
create policy "traveler_parts_ordered_customer_select_own"
  on public.traveler_parts_ordered
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

drop policy if exists "traveler_testing_qc_customer_select_own" on public.traveler_testing_qc;
create policy "traveler_testing_qc_customer_select_own"
  on public.traveler_testing_qc
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

drop policy if exists "traveler_attachments_customer_select_own" on public.traveler_attachments;
create policy "traveler_attachments_customer_select_own"
  on public.traveler_attachments
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

commit;
