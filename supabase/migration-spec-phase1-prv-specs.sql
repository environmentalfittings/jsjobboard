-- PRV/PSV Manufacturer Spec - Phase 1 (revised)
-- Reuses public.manufacturers + resource_documents (same storage bytes).
--
-- IMPORTANT - Supabase SQL Editor splits on semicolons and breaks PL/pgSQL functions.
-- This file uses SQL-only helpers + CHECK constraints (no semicolons inside function bodies).
-- If you still hit errors, run via: supabase db execute -f supabase/migration-spec-phase1-prv-specs.sql
--
-- Prerequisites: public.manufacturers, public.resource_documents, public.employees exist.
-- Requires public.set_updated_at() (already created by earlier migrations).

begin;

create extension if not exists pgcrypto;

-- Clean up from prior partial runs (SQL Editor may have split PL/pgSQL bodies).
drop function if exists public.assert_spec_row_approved(regclass, uuid);
drop function if exists public.enforce_spec_provenance_on_approve() cascade;

-- ============================================================
-- Helpers (uses $fn$ quoting for SQL Editor compatibility)
-- ============================================================

create or replace function public.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    exists (
      select 1
      from public.technicians t
      where coalesce(t.active, true) = true
        and lower(trim(coalesce(t.role, ''))) = 'admin'
        and (
          t.user_id = auth.uid()
          or lower(trim(coalesce(t.login_username, ''))) = lower(trim(coalesce(
            nullif(auth.jwt() -> 'user_metadata' ->> 'username', ''),
            split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1),
            ''
          )))
        )
    )
    or lower(trim(coalesce(
      auth.jwt() -> 'app_metadata' ->> 'role',
      auth.jwt() -> 'user_metadata' ->> 'role',
      ''
    ))) = 'admin'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and lower(trim(coalesce(p.role, ''))) = 'admin'
    ),
    false
  )
$fn$;

-- Quality VR program editors - admin/manager only (not all quality team).
create or replace function public.is_spec_quality_editor()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    exists (
      select 1
      from public.employees e
      where e.auth_user_id = auth.uid()
        and coalesce(e.quality_team_level, 'none') in ('admin', 'manager')
    ),
    false
  )
$fn$;

create or replace function public.can_write_spec_data()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_shop_admin() or public.is_spec_quality_editor()
$fn$;

-- Approved Layer 2 rows require citation columns (enforced via CHECK, not PL/pgSQL trigger).
-- verified_by / verified_at are set by the quality admin UI on approve (Phase 2 trigger optional).

-- ============================================================
-- Extend existing manufacturers
-- ============================================================

alter table public.manufacturers
  add column if not exists slug text,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.manufacturers m
set slug = coalesce(
  nullif(
    lower(
      trim(both '-' from
        replace(replace(replace(replace(replace(trim(m.name), ' ', '-'), '.', ''), ',', ''), '/', '-'), '&', 'and')
      )
    ),
    ''
  ),
  'mfg-' || left(replace(m.id::text, '-', ''), 8)
)
where slug is null or trim(slug) = '';

with slug_ranked as (
  select id, slug, row_number() over (partition by slug order by name asc, id asc) as slug_rank
  from public.manufacturers
  where slug is not null and trim(slug) <> ''
)
update public.manufacturers m
set slug = case when r.slug_rank = 1 then r.slug else r.slug || '-' || r.slug_rank::text end
from slug_ranked r
where m.id = r.id and r.slug_rank > 1;

insert into public.manufacturers (name, slug, notes, is_active)
values
  ('Farris', 'farris', 'Curtiss-Wright / Farris Engineering PRV/PSV', true),
  ('Consolidated', 'consolidated', 'Consolidated Valve PRV/PSV', true),
  ('Crosby', 'crosby', 'Crosby / Emerson PRV/PSV', true),
  ('Anderson Greenwood', 'anderson-greenwood', 'Anderson Greenwood PRV/PSV', true)
on conflict (name) do update
set
  slug = coalesce(nullif(trim(public.manufacturers.slug), ''), excluded.slug),
  notes = coalesce(public.manufacturers.notes, excluded.notes),
  is_active = true;

create unique index if not exists manufacturers_slug_unique_idx
  on public.manufacturers (slug)
  where slug is not null and trim(slug) <> '';

-- ============================================================
-- manufacturer_aliases (nameplate spellings → canonical ID)
-- ============================================================

create table if not exists public.manufacturer_aliases (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id) on delete cascade,
  alias_text text not null,
  normalized_alias text not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint manufacturer_aliases_normalized_unique unique (normalized_alias)
);

create index if not exists idx_manufacturer_aliases_mfg
  on public.manufacturer_aliases (manufacturer_id);

insert into public.manufacturer_aliases (manufacturer_id, alias_text, normalized_alias)
select m.id, x.alias_text, lower(trim(x.alias_text))
from public.manufacturers m
join (
  values
    ('Farris', 'F'),
    ('Farris', 'Farris'),
    ('Farris', 'FARRIS'),
    ('Consolidated', 'Consolidated'),
    ('Consolidated', 'CONSOLIDATED'),
    ('Crosby', 'Crosby'),
    ('Crosby', 'CROSBY'),
    ('Anderson Greenwood', 'Anderson Greenwood'),
    ('Anderson Greenwood', 'A.G.'),
    ('Anderson Greenwood', 'AG'),
    ('Anderson Greenwood', 'AG.')
) as x(mfg_name, alias_text) on x.mfg_name = m.name
on conflict (normalized_alias) do nothing;

-- ============================================================
-- Layer 1 — spec_documents (promoted from resource_documents)
-- ============================================================

create table if not exists public.spec_documents (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id),
  resource_document_id bigint references public.resource_documents(id),
  title text not null,
  doc_type text not null check (
    doc_type in (
      'spring_chart',
      'catalog',
      'maintenance_manual',
      'critical_dimensions',
      'code',
      'national_board',
      'bulletin'
    )
  ),
  edition_label text,
  revision_label text,
  effective_date date,
  superseded_by_id uuid references public.spec_documents(id),
  page_count int check (page_count is null or page_count > 0),
  external_url text,
  notes text,
  status text not null default 'active' check (status in ('active', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spec_documents_resource_or_title_chk check (
    resource_document_id is not null or length(trim(title)) > 0
  )
);

create unique index if not exists spec_documents_resource_document_unique
  on public.spec_documents (resource_document_id)
  where resource_document_id is not null;

create index if not exists idx_spec_documents_manufacturer
  on public.spec_documents (manufacturer_id, status, doc_type);

drop trigger if exists spec_documents_set_updated_at on public.spec_documents;
create trigger spec_documents_set_updated_at
before update on public.spec_documents
for each row execute function public.set_updated_at();

-- Citation page views (Edge Function audit log)
create table if not exists public.spec_document_page_views (
  id uuid primary key default gen_random_uuid(),
  spec_document_id uuid not null references public.spec_documents(id) on delete cascade,
  user_id uuid references auth.users(id),
  source_page int not null check (source_page >= 1),
  printed_page_label text,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_spec_document_page_views_doc
  on public.spec_document_page_views (spec_document_id, viewed_at desc);

-- ============================================================
-- Layer 2 — valve_series
-- ============================================================

create table if not exists public.valve_series (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id),
  name text not null,
  design_code_basis text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valve_series_manufacturer_name_unique unique (manufacturer_id, name)
);

drop trigger if exists valve_series_set_updated_at on public.valve_series;
create trigger valve_series_set_updated_at
before update on public.valve_series
for each row execute function public.set_updated_at();

-- ============================================================
-- Layer 2 — orifices (API area only; Kd lives in orifice_capacities)
-- ============================================================

create table if not exists public.orifices (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid references public.manufacturers(id),
  designation text not null,
  effective_area_sq_in numeric(12, 6),
  is_api_standard boolean not null default false,
  source_document_id uuid references public.spec_documents(id),
  source_page int check (source_page is null or source_page >= 1),
  printed_page_label text,
  source_quote text,
  source_bbox jsonb,
  extraction_method text not null default 'imported' check (
    extraction_method in ('manual', 'ai_assisted', 'imported')
  ),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'superseded')
  ),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  superseded_by_id uuid references public.orifices(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists orifices_api_designation_unique
  on public.orifices (designation)
  where manufacturer_id is null and is_api_standard = true;

create unique index if not exists orifices_mfg_designation_unique
  on public.orifices (manufacturer_id, designation)
  where manufacturer_id is not null;

drop trigger if exists orifices_set_updated_at on public.orifices;
create trigger orifices_set_updated_at
before update on public.orifices
for each row execute function public.set_updated_at();

drop trigger if exists orifices_provenance on public.orifices;

alter table public.orifices drop constraint if exists orifices_approved_citation_chk;
alter table public.orifices add constraint orifices_approved_citation_chk check (
  status is distinct from 'approved'
  or (source_document_id is not null and source_page is not null and source_page >= 1)
);

-- API 526 effective areas — draft until Mike confirms against API 526
insert into public.orifices (manufacturer_id, designation, effective_area_sq_in, is_api_standard, status, notes, extraction_method)
select v.manufacturer_id, v.designation, v.effective_area_sq_in, true, 'draft', v.notes, 'imported'
from (
  values
    (null::uuid, 'D', 0.110::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'E', 0.196::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'F', 0.307::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'G', 0.503::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'H', 0.785::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'J', 1.287::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'K', 1.838::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'L', 2.853::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'M', 3.600::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'N', 4.340::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'P', 6.380::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'Q', 11.050::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'R', 16.000::numeric, 'API 526 nominal effective area — pending VR confirmation'),
    (null::uuid, 'T', 26.000::numeric, 'API 526 nominal effective area — pending VR confirmation')
) as v(manufacturer_id, designation, effective_area_sq_in, notes)
where not exists (
  select 1
  from public.orifices o
  where o.is_api_standard = true
    and o.manufacturer_id is null
    and o.designation = v.designation
);

-- ============================================================
-- Layer 2 — orifice_capacities (Kd + rated capacity, series-specific)
-- ============================================================

create table if not exists public.orifice_capacities (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id),
  valve_series_id uuid references public.valve_series(id),
  orifice_id uuid not null references public.orifices(id),
  kd numeric(8, 6),
  api_area_sq_in numeric(12, 6),
  rated_capacity_air_scfm numeric(14, 4),
  source_document_id uuid references public.spec_documents(id),
  source_page int check (source_page is null or source_page >= 1),
  printed_page_label text,
  source_quote text,
  source_bbox jsonb,
  extraction_method text not null default 'manual' check (
    extraction_method in ('manual', 'ai_assisted', 'imported')
  ),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'superseded')
  ),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  superseded_by_id uuid references public.orifice_capacities(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_orifice_capacities_lookup
  on public.orifice_capacities (manufacturer_id, valve_series_id, orifice_id, status);

drop trigger if exists orifice_capacities_set_updated_at on public.orifice_capacities;
create trigger orifice_capacities_set_updated_at
before update on public.orifice_capacities
for each row execute function public.set_updated_at();

drop trigger if exists orifice_capacities_provenance on public.orifice_capacities;

alter table public.orifice_capacities drop constraint if exists orifice_capacities_approved_citation_chk;
alter table public.orifice_capacities add constraint orifice_capacities_approved_citation_chk check (
  status is distinct from 'approved'
  or (source_document_id is not null and source_page is not null and source_page >= 1)
);

-- ============================================================
-- Layer 2 — model_nomenclature_rules
-- ============================================================

create table if not exists public.model_nomenclature_rules (
  id uuid primary key default gen_random_uuid(),
  valve_series_id uuid not null references public.valve_series(id),
  pattern text not null,
  segment_map jsonb not null default '{}'::jsonb,
  source_document_id uuid references public.spec_documents(id),
  source_page int check (source_page is null or source_page >= 1),
  printed_page_label text,
  source_quote text,
  source_bbox jsonb,
  extraction_method text not null default 'manual' check (
    extraction_method in ('manual', 'ai_assisted', 'imported')
  ),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'superseded')
  ),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  superseded_by_id uuid references public.model_nomenclature_rules(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists model_nomenclature_rules_set_updated_at on public.model_nomenclature_rules;
create trigger model_nomenclature_rules_set_updated_at
before update on public.model_nomenclature_rules
for each row execute function public.set_updated_at();

drop trigger if exists model_nomenclature_rules_provenance on public.model_nomenclature_rules;

alter table public.model_nomenclature_rules drop constraint if exists model_nomenclature_rules_approved_citation_chk;
alter table public.model_nomenclature_rules add constraint model_nomenclature_rules_approved_citation_chk check (
  status is distinct from 'approved'
  or (source_document_id is not null and source_page is not null and source_page >= 1)
);

-- ============================================================
-- Layer 2 — spring_specs (lookup against CDTP)
-- ============================================================

create table if not exists public.spring_specs (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.manufacturers(id),
  valve_series_id uuid references public.valve_series(id),
  orifice_id uuid references public.orifices(id),
  spring_part_number text,
  spring_material_code text,
  set_pressure_min numeric(12, 4) not null,
  set_pressure_max numeric(12, 4) not null,
  pressure_unit text not null default 'psig',
  reference_temp_f numeric(8, 2) not null default 70,
  material text,
  color_code text,
  inlet_size_constraint text,
  service text not null default 'both' check (service in ('section_I', 'section_VIII', 'both')),
  source_document_id uuid references public.spec_documents(id),
  source_page int check (source_page is null or source_page >= 1),
  printed_page_label text,
  source_quote text,
  source_bbox jsonb,
  extraction_method text not null default 'manual' check (
    extraction_method in ('manual', 'ai_assisted', 'imported')
  ),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'superseded')
  ),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  superseded_by_id uuid references public.spring_specs(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spring_specs_pressure_range_chk check (set_pressure_max >= set_pressure_min)
);

create index if not exists idx_spring_specs_lookup
  on public.spring_specs (
    manufacturer_id, valve_series_id, orifice_id, spring_material_code, service, status,
    set_pressure_min, set_pressure_max
  )
  where status = 'approved';

drop trigger if exists spring_specs_set_updated_at on public.spring_specs;
create trigger spring_specs_set_updated_at
before update on public.spring_specs
for each row execute function public.set_updated_at();

drop trigger if exists spring_specs_provenance on public.spring_specs;

alter table public.spring_specs drop constraint if exists spring_specs_approved_citation_chk;
alter table public.spring_specs add constraint spring_specs_approved_citation_chk check (
  status is distinct from 'approved'
  or (source_document_id is not null and source_page is not null and source_page >= 1)
);

-- ============================================================
-- Layer 2 — spring_temp_corrections (when CDTP not supplied)
-- ============================================================

create table if not exists public.spring_temp_corrections (
  id uuid primary key default gen_random_uuid(),
  valve_series_id uuid not null references public.valve_series(id),
  temp_low_f numeric(8, 2) not null,
  temp_high_f numeric(8, 2) not null,
  correction_kind text not null check (correction_kind in ('factor', 'delta_psi')),
  correction_value numeric(12, 6) not null,
  source_document_id uuid references public.spec_documents(id),
  source_page int check (source_page is null or source_page >= 1),
  printed_page_label text,
  source_quote text,
  source_bbox jsonb,
  extraction_method text not null default 'manual' check (
    extraction_method in ('manual', 'ai_assisted', 'imported')
  ),
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'draft' check (
    status in ('draft', 'in_review', 'approved', 'superseded')
  ),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  superseded_by_id uuid references public.spring_temp_corrections(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spring_temp_corrections_range_chk check (temp_high_f >= temp_low_f)
);

drop trigger if exists spring_temp_corrections_set_updated_at on public.spring_temp_corrections;
create trigger spring_temp_corrections_set_updated_at
before update on public.spring_temp_corrections
for each row execute function public.set_updated_at();

drop trigger if exists spring_temp_corrections_provenance on public.spring_temp_corrections;

alter table public.spring_temp_corrections drop constraint if exists spring_temp_corrections_approved_citation_chk;
alter table public.spring_temp_corrections add constraint spring_temp_corrections_approved_citation_chk check (
  status is distinct from 'approved'
  or (source_document_id is not null and source_page is not null and source_page >= 1)
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.manufacturer_aliases enable row level security;
alter table public.spec_documents enable row level security;
alter table public.spec_document_page_views enable row level security;
alter table public.valve_series enable row level security;
alter table public.orifices enable row level security;
alter table public.orifice_capacities enable row level security;
alter table public.model_nomenclature_rules enable row level security;
alter table public.spring_specs enable row level security;
alter table public.spring_temp_corrections enable row level security;

-- Read: any authenticated (technicians included)
-- Write: shop admin OR quality admin/manager only

drop policy if exists manufacturer_aliases_select_authenticated on public.manufacturer_aliases;
create policy manufacturer_aliases_select_authenticated on public.manufacturer_aliases for select to authenticated using (true);
drop policy if exists manufacturer_aliases_write_editors on public.manufacturer_aliases;
create policy manufacturer_aliases_write_editors on public.manufacturer_aliases for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists spec_documents_select_authenticated on public.spec_documents;
create policy spec_documents_select_authenticated on public.spec_documents for select to authenticated using (true);
drop policy if exists spec_documents_write_editors on public.spec_documents;
create policy spec_documents_write_editors on public.spec_documents for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists valve_series_select_authenticated on public.valve_series;
create policy valve_series_select_authenticated on public.valve_series for select to authenticated using (true);
drop policy if exists valve_series_write_editors on public.valve_series;
create policy valve_series_write_editors on public.valve_series for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists orifices_select_authenticated on public.orifices;
create policy orifices_select_authenticated on public.orifices for select to authenticated using (true);
drop policy if exists orifices_write_editors on public.orifices;
create policy orifices_write_editors on public.orifices for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists orifice_capacities_select_authenticated on public.orifice_capacities;
create policy orifice_capacities_select_authenticated on public.orifice_capacities for select to authenticated using (true);
drop policy if exists orifice_capacities_write_editors on public.orifice_capacities;
create policy orifice_capacities_write_editors on public.orifice_capacities for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists model_nomenclature_rules_select_authenticated on public.model_nomenclature_rules;
create policy model_nomenclature_rules_select_authenticated on public.model_nomenclature_rules for select to authenticated using (true);
drop policy if exists model_nomenclature_rules_write_editors on public.model_nomenclature_rules;
create policy model_nomenclature_rules_write_editors on public.model_nomenclature_rules for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists spring_specs_select_authenticated on public.spring_specs;
create policy spring_specs_select_authenticated on public.spring_specs for select to authenticated using (true);
drop policy if exists spring_specs_write_editors on public.spring_specs;
create policy spring_specs_write_editors on public.spring_specs for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

drop policy if exists spring_temp_corrections_select_authenticated on public.spring_temp_corrections;
create policy spring_temp_corrections_select_authenticated on public.spring_temp_corrections for select to authenticated using (true);
drop policy if exists spring_temp_corrections_write_editors on public.spring_temp_corrections;
create policy spring_temp_corrections_write_editors on public.spring_temp_corrections for all to authenticated using (public.can_write_spec_data()) with check (public.can_write_spec_data());

-- Page views: any authenticated can insert (via Edge Function) and read own
drop policy if exists spec_document_page_views_select on public.spec_document_page_views;
create policy spec_document_page_views_select
  on public.spec_document_page_views for select to authenticated using (true);

drop policy if exists spec_document_page_views_insert on public.spec_document_page_views;
create policy spec_document_page_views_insert
  on public.spec_document_page_views for insert to authenticated with check (true);

-- Grants
grant select on public.manufacturer_aliases, public.spec_documents, public.spec_document_page_views,
  public.valve_series, public.orifices, public.orifice_capacities,
  public.model_nomenclature_rules, public.spring_specs, public.spring_temp_corrections
  to authenticated;
grant insert, update, delete on public.manufacturer_aliases, public.spec_documents,
  public.valve_series, public.orifices, public.orifice_capacities,
  public.model_nomenclature_rules, public.spring_specs, public.spring_temp_corrections
  to authenticated;
grant insert on public.spec_document_page_views to authenticated;

grant execute on function public.is_shop_admin() to authenticated;
grant execute on function public.is_spec_quality_editor() to authenticated;
grant execute on function public.can_write_spec_data() to authenticated;

commit;
