-- Material identification: shared PMI materials dropdowns + PMI required / report.
-- PMI report is required only when PMI required = Yes.
-- Runtime ensureMaterialIdentificationPmiReqs also upgrades open plans.

begin;

-- Register PMI materials traveler list + seed common grades (safe to re-run).
insert into public.lookup_values (category, value, sort_order)
select ITP_TRAVELER_LIST_REGISTRY.category, ITP_TRAVELER_LIST_REGISTRY.value, ITP_TRAVELER_LIST_REGISTRY.sort_order
from (
  values
    ('__itp_traveler_lists__', 'pmi_materials::PMI materials', 1)
) as ITP_TRAVELER_LIST_REGISTRY(category, value, sort_order)
where not exists (
  select 1
  from public.lookup_values lv
  where lv.category = '__itp_traveler_lists__'
    and lower(split_part(lv.value, '::', 1)) = 'pmi_materials'
);

insert into public.lookup_values (category, value, sort_order)
select seed.category, seed.value, seed.sort_order
from (
  values
    ('itp_traveler:pmi_materials', 'WCB', 0),
    ('itp_traveler:pmi_materials', 'WC1', 1),
    ('itp_traveler:pmi_materials', 'F11', 2),
    ('itp_traveler:pmi_materials', 'F22', 3),
    ('itp_traveler:pmi_materials', 'C5', 4),
    ('itp_traveler:pmi_materials', 'C12', 5),
    ('itp_traveler:pmi_materials', 'P91', 6),
    ('itp_traveler:pmi_materials', '304 SS', 7),
    ('itp_traveler:pmi_materials', '309 SS', 8),
    ('itp_traveler:pmi_materials', '316 SS', 9),
    ('itp_traveler:pmi_materials', '347 SS', 10),
    ('itp_traveler:pmi_materials', 'Monel', 11),
    ('itp_traveler:pmi_materials', 'Hastelloy', 12),
    ('itp_traveler:pmi_materials', 'Alloy 400', 13),
    ('itp_traveler:pmi_materials', 'Alloy C276', 14),
    ('itp_traveler:pmi_materials', 'CR', 15),
    ('itp_traveler:pmi_materials', 'ENP', 16),
    ('itp_traveler:pmi_materials', 'CI/ENP', 17),
    ('itp_traveler:pmi_materials', 'CS/ENP', 18),
    ('itp_traveler:pmi_materials', 'Other', 19)
) as seed(category, value, sort_order)
where not exists (
  select 1
  from public.lookup_values lv
  where lv.category = seed.category
    and lower(trim(lv.value)) = lower(trim(seed.value))
);

update public.itp_library_templates t
set scope = jsonb_set(
  jsonb_set(
    t.scope,
    array['sel', item_id, 'measFields'],
    new_fields
  ),
  array['sel', item_id, 'beforeMeas'],
  'true'::jsonb
)
from (
  select
    id as template_id,
    key as item_id,
    (
      select jsonb_agg(field order by ord)
      from (
        select
          row_number() over (order by ordinality) as ord,
          case
            when lower(trim(field->>'label')) in ('is pmi required', 'pmi required', 'pmi report') then null
            when coalesce(field->>'type', 'text') = 'picture' then field
            else field || jsonb_build_object(
              'type', 'dropdown',
              'required', true,
              'options', '[]'::jsonb,
              'optionSource', 'lookup',
              'lookupCategory', 'itp_traveler:pmi_materials',
              'followUpWhen', 'Other',
              'followUpLabel', 'Material grade'
            )
          end as field
        from jsonb_array_elements(coalesce(sel_item->'measFields', '[]'::jsonb))
          with ordinality as e(field, ordinality)

        union all

        select
          900 as ord,
          jsonb_build_object(
            'id', key || '_pmi_required',
            'label', 'PMI required',
            'type', 'yes_no',
            'options', '[]'::jsonb,
            'required', true
          )

        union all

        select
          901 as ord,
          jsonb_build_object(
            'id', key || '_pmi_report',
            'label', 'PMI report',
            'type', 'picture',
            'options', '[]'::jsonb,
            'required', false,
            'maxPhotos', 3,
            'requiredWhenLabel', 'PMI required',
            'requiredWhenValue', 'Yes',
            'requiredWhenFieldId', key || '_pmi_required'
          )
      ) rebuilt
      where field is not null
    ) as new_fields
  from public.itp_library_templates tmpl
  cross join lateral jsonb_each(tmpl.scope->'sel') as e(key, sel_item)
  where tmpl.name like 'Traveler - %'
    and (
      key ~ '^trv_[a-z]+_02$'
      or exists (
        select 1
        from jsonb_array_elements(coalesce(sel_item->'measFields', '[]'::jsonb)) f
        where lower(trim(f->>'label')) in ('pmi report', 'is pmi required', 'pmi required')
      )
    )
) patch
where t.id = patch.template_id;

commit;
