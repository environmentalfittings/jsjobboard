-- J~S Valve Job Board — Supabase Traveler Schema
-- Run in Supabase SQL Editor or via migration tooling.

begin;

create extension if not exists pgcrypto;

-- ============================================================
-- SECTION 1: REFERENCE / LOOKUP TABLES
-- ============================================================

create table if not exists public.valve_types (
  id text primary key,
  label text not null,
  sort_order int default 0
);

insert into public.valve_types (id, label, sort_order) values
  ('a', 'Lubricated Plug Valve',                  1),
  ('b', 'Non Lubricated Plug Valve',              2),
  ('c', 'Orbit Valve',                            3),
  ('d', 'Piston Check',                           4),
  ('f', 'Pressure Seal Check Valve',              5),
  ('g', 'Pressure Seal Gate Valve',               6),
  ('h', 'Pressure Seal Globe Valve',              7),
  ('i', 'Twinseal',                               8),
  ('j', 'Pipeline Gate',                          9),
  ('k', 'Angle Globe Valve',                     10),
  ('l', 'Check Valve',                           11),
  ('m', 'Gate Valve',                            12),
  ('n', 'Globe Valve',                           13),
  ('o', 'Ball Valve',                            14),
  ('p', 'Wedge Plug',                            15),
  ('q', 'Delayed Coker - Isolation Ball Valve',  16),
  ('r', 'Relief Valve - VR Traveler',            17),
  ('s', 'Relief Valve - TO Traveler',            18),
  ('t', 'Manufacturing Traveler',                19)
on conflict (id) do nothing;

create table if not exists public.manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.packing_sizes (
  id uuid primary key default gen_random_uuid(),
  label text not null unique
);

create table if not exists public.test_gauges (
  id uuid primary key default gen_random_uuid(),
  gauge_type text not null,
  gauge_id text not null,
  updated_at timestamptz default now()
);

insert into public.test_gauges (gauge_type, gauge_id) values
  ('Low',     'JS284'),
  ('High',    'JS284'),
  ('Shell',   'JS284'),
  ('Methane', '1'),
  ('Helium',  '304046')
on conflict do nothing;

-- ============================================================
-- SECTION 2: TRAVELER CORE TABLE
-- ============================================================

create table if not exists public.travelers (
  id uuid primary key default gen_random_uuid(),
  valve_id text not null unique,
  valve_type_id text references public.valve_types(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_complete boolean default false
);

create index if not exists travelers_valve_id_idx on public.travelers(valve_id);

-- ============================================================
-- SECTION 3: BASIC INFORMATION (Part 1)
-- ============================================================

create table if not exists public.traveler_basic_info (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  customer text,
  salesman text,
  purchase_order_no text,
  customer_valve_id text,
  location_id text,
  manufacturer_id uuid references public.manufacturers(id),
  manufacturer_name text,
  due_date date,
  manufacturer_sn text,
  pressure text,
  size text,
  outlet_connection text check (outlet_connection in ('RF','RTJ','BW','FF','Other')),
  figure_number text,
  drawing_number text,
  operator text check (operator in ('Handwheel','Gear Op.','Air Act.','Electric Act.')),
  valve_condition text check (valve_condition in ('Repairable','Unrepairable')),
  junked_reason text,
  notes text,
  material_id jsonb default '{}'::jsonb,
  pmi_required boolean,
  pmi_attached boolean,
  tech_initials text,
  submitted_at timestamptz,
  is_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 4: FILE ATTACHMENTS
-- ============================================================

create table if not exists public.traveler_attachments (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  file_type text not null check (file_type in (
    'image_before',
    'image_after',
    'qa_doc',
    'additional_doc',
    'weld_cert',
    'pmi_report'
  )),
  file_name text not null,
  file_url text not null,
  file_size int,
  uploaded_by text,
  uploaded_at timestamptz default now()
);

create index if not exists traveler_attachments_traveler_id_idx
  on public.traveler_attachments(traveler_id);

-- ============================================================
-- SECTION 5: VALVE SELECTION (Part 2)
-- ============================================================

create table if not exists public.traveler_valve_selection (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  notes text,
  tech_initials text,
  submitted_at timestamptz,
  is_complete boolean default false,
  is_na boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 6: PARTS LINKED TO VALVE SELECTION
-- ============================================================

create table if not exists public.traveler_parts (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  part_name text,
  part_number text,
  quantity int default 1,
  before_image_url text,
  after_image_url text,
  unit_cost numeric(10,2),
  status text check (status in ('needed','ordered','received','installed','repair','replace','new','other')),
  ordered_date date,
  received_date date,
  supplier text,
  notes text,
  created_at timestamptz default now()
);

alter table public.traveler_parts add column if not exists before_image_url text;
alter table public.traveler_parts add column if not exists after_image_url text;
alter table public.traveler_parts drop constraint if exists traveler_parts_status_check;
alter table public.traveler_parts
  add constraint traveler_parts_status_check
  check (status in ('needed','ordered','received','installed','repair','replace','new','other'));

-- ============================================================
-- SECTION 7: VALVE SPECIFICATIONS (Part 3)
-- ============================================================

create table if not exists public.traveler_valve_specs (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  valve_type_id text references public.valve_types(id),
  kit_type text,
  specs jsonb default '{}'::jsonb,
  tech_initials_specs text,
  submitted_specs_at timestamptz,
  tech_initials_dims text,
  submitted_dims_at timestamptz,
  tech_initials_assembly text,
  submitted_assembly_at timestamptz,
  is_complete boolean default false,
  is_na boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 8: WELDING
-- ============================================================

create table if not exists public.traveler_welding (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  is_na boolean default false,
  weld_procedure text,
  welder_id text,
  preheat_temp text,
  postheat_temp text,
  filler_material text,
  inspection_result text,
  notes text,
  tech_initials text,
  submitted_at timestamptz,
  is_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 9: OTHER PARTS REQUIRED
-- ============================================================

create table if not exists public.traveler_other_parts (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  is_na boolean default false,
  parts_notes text,
  tech_initials text,
  submitted_at timestamptz,
  is_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 10: PARTS ORDERED
-- ============================================================

create table if not exists public.traveler_parts_ordered (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  is_na boolean default false,
  order_notes text,
  tech_initials text,
  submitted_at timestamptz,
  is_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 11: TESTING & QUALITY CHECKLIST
-- ============================================================

create table if not exists public.traveler_testing_qc (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  valve_id text not null,
  testing_notes text,
  testing_tech_initials text,
  testing_completed_at timestamptz,
  qa_test_area_notes text,
  qa_test_area_tech_initials text,
  qa_test_area_completed_at timestamptz,
  shipping_notes text,
  shipping_tech_initials text,
  shipping_completed_at timestamptz,
  final_inspection_notes text,
  final_inspection_tech_initials text,
  final_inspection_completed_at timestamptz,
  is_complete boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 12: CUSTOMER PORTAL USERS
-- ============================================================

create table if not exists public.customer_portal_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  customer_name text not null,
  auth_user_id uuid,
  is_active boolean default true,
  created_at timestamptz default now(),
  last_login_at timestamptz
);

-- ============================================================
-- SECTION 13: INVENTORY
-- ============================================================

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  customer text,
  manufacturer_id uuid references public.manufacturers(id),
  manufacturer_name text,
  valve_type_id text references public.valve_types(id),
  body_material text,
  api_trim text,
  size text,
  pressure text,
  operator text,
  customer_id_no text,
  notes text,
  js_inventory_id text unique,
  origin text,
  image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- SECTION 14: HELPER FUNCTION — TRAVELER STATUS ROLLUP
-- ============================================================

create or replace function public.traveler_section_status(p_traveler_id uuid)
returns table (
  section text,
  is_complete boolean,
  is_na boolean,
  tech_initials text,
  submitted_at timestamptz
) language sql stable as $$
  select 'basic_info', bi.is_complete, false, bi.tech_initials, bi.submitted_at
    from public.traveler_basic_info bi where bi.traveler_id = p_traveler_id
  union all
  select 'valve_selection', vs.is_complete, vs.is_na, vs.tech_initials, vs.submitted_at
    from public.traveler_valve_selection vs where vs.traveler_id = p_traveler_id
  union all
  select 'valve_specs', sp.is_complete, sp.is_na, sp.tech_initials_assembly, sp.submitted_assembly_at
    from public.traveler_valve_specs sp where sp.traveler_id = p_traveler_id
  union all
  select 'welding', w.is_complete, w.is_na, w.tech_initials, w.submitted_at
    from public.traveler_welding w where w.traveler_id = p_traveler_id
  union all
  select 'other_parts', op.is_complete, op.is_na, op.tech_initials, op.submitted_at
    from public.traveler_other_parts op where op.traveler_id = p_traveler_id
  union all
  select 'parts_ordered', po.is_complete, po.is_na, po.tech_initials, po.submitted_at
    from public.traveler_parts_ordered po where po.traveler_id = p_traveler_id
  union all
  select 'testing_qc', tq.is_complete, false, tq.final_inspection_tech_initials, tq.final_inspection_completed_at
    from public.traveler_testing_qc tq where tq.traveler_id = p_traveler_id;
$$;

-- ============================================================
-- SECTION 15: AUTO-UPDATE updated_at TRIGGER
-- ============================================================

create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_travelers_updated_at on public.travelers;
create trigger trg_travelers_updated_at
  before update on public.travelers
  for each row execute function public.update_updated_at();

drop trigger if exists trg_basic_info_updated_at on public.traveler_basic_info;
create trigger trg_basic_info_updated_at
  before update on public.traveler_basic_info
  for each row execute function public.update_updated_at();

drop trigger if exists trg_valve_selection_updated_at on public.traveler_valve_selection;
create trigger trg_valve_selection_updated_at
  before update on public.traveler_valve_selection
  for each row execute function public.update_updated_at();

drop trigger if exists trg_valve_specs_updated_at on public.traveler_valve_specs;
create trigger trg_valve_specs_updated_at
  before update on public.traveler_valve_specs
  for each row execute function public.update_updated_at();

drop trigger if exists trg_welding_updated_at on public.traveler_welding;
create trigger trg_welding_updated_at
  before update on public.traveler_welding
  for each row execute function public.update_updated_at();

drop trigger if exists trg_other_parts_updated_at on public.traveler_other_parts;
create trigger trg_other_parts_updated_at
  before update on public.traveler_other_parts
  for each row execute function public.update_updated_at();

drop trigger if exists trg_parts_ordered_updated_at on public.traveler_parts_ordered;
create trigger trg_parts_ordered_updated_at
  before update on public.traveler_parts_ordered
  for each row execute function public.update_updated_at();

drop trigger if exists trg_testing_qc_updated_at on public.traveler_testing_qc;
create trigger trg_testing_qc_updated_at
  before update on public.traveler_testing_qc
  for each row execute function public.update_updated_at();

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
  before update on public.inventory
  for each row execute function public.update_updated_at();

-- ============================================================
-- SECTION 16: ROW LEVEL SECURITY (RLS)
-- ============================================================

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

drop policy if exists "customer_portal_users_self_select" on public.customer_portal_users;
create policy "customer_portal_users_self_select"
  on public.customer_portal_users
  for select
  to authenticated
  using (auth_user_id = auth.uid());

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

drop policy if exists "traveler_internal_full_access" on public.travelers;
create policy "traveler_internal_full_access"
  on public.travelers for all
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
  on public.traveler_basic_info for all
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
  on public.traveler_valve_selection for all
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
  on public.traveler_valve_specs for all
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
  on public.traveler_welding for all
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
  on public.traveler_other_parts for all
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
  on public.traveler_parts_ordered for all
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
  on public.traveler_testing_qc for all
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
  on public.traveler_attachments for all
  to authenticated
  using (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  )
  with check (
    coalesce(auth.jwt() ->> 'role', auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role')
    in ('admin', 'manager', 'supervisor', 'technician', 'tech')
  );

drop policy if exists "traveler_customer_select_own" on public.travelers;
create policy "traveler_customer_select_own"
  on public.travelers for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_basic_info for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_valve_selection for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_valve_specs for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_welding for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_other_parts for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_parts_ordered for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_testing_qc for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
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
  on public.traveler_attachments for select
  to authenticated
  using (
    valve_id in (
      select bi.valve_id from public.traveler_basic_info bi
      where bi.customer = (
        select cpu.customer_name
        from public.customer_portal_users cpu
        where cpu.auth_user_id = auth.uid()
        limit 1
      )
    )
  );

-- ============================================================
-- SECTION 17: MATERIAL ID TEMPLATES (Reference)
-- ============================================================

create table if not exists public.valve_type_material_templates (
  valve_type_id text primary key references public.valve_types(id),
  template jsonb not null
);

insert into public.valve_type_material_templates (valve_type_id, template) values
  ('b', '{"body":"","seat":"","diaphragm":"","top_cap":"","thrust_collar":"","metal_diaphragm":"","plug":"","adjuster":""}'),
  ('a', '{"body":"","seat":"","plug":"","top_cap":"","lubricant":""}'),
  ('l', '{"body":"","clapper":"","clapper_nut":"","top_cap":"","seat":"","pin":"","clapper_arm":""}'),
  ('m', '{"body":"","wedge":"","stem":"","seat_rings":"","bonnet":""}'),
  ('n', '{"body":"","disc":"","stem":"","seat_ring":"","bonnet":""}'),
  ('o', '{"body":"","ball":"","stem":"","seats":"","end_caps":""}'),
  ('i', '{"body":"","seats":"","stem":"","end_connections":""}'),
  ('c', '{"body":"","ball":"","stem":"","seats":"","sleeve":""}'),
  ('r', '{"body":"","disc":"","spring":"","nozzle":"","spindle":""}'),
  ('s', '{"body":"","disc":"","spring":"","nozzle":"","spindle":""}')
on conflict (valve_type_id) do nothing;

commit;
