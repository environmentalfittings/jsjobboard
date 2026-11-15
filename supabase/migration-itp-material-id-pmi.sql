-- Material identification: always collect material IDs + “Is PMI required?”.
-- PMI report is required only when the answer is Yes.
-- Runtime ensureMaterialIdentificationPmiReqs also upgrades open plans; this
-- patches named traveler templates already stored in the database.

begin;

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
        -- Keep existing non-PMI fields (material parts, etc.), force required text.
        select
          row_number() over (order by ordinality) as ord,
          case
            when lower(trim(field->>'label')) in ('is pmi required', 'pmi report') then null
            when coalesce(field->>'type', 'text') = 'picture' then field
            else field || jsonb_build_object('required', true)
          end as field
        from jsonb_array_elements(coalesce(sel_item->'measFields', '[]'::jsonb))
          with ordinality as e(field, ordinality)

        union all

        select
          900 as ord,
          jsonb_build_object(
            'id', key || '_pmi_required',
            'label', 'Is PMI required',
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
            'requiredWhenLabel', 'Is PMI required',
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
        where lower(trim(f->>'label')) in ('pmi report', 'is pmi required')
      )
    )
) patch
where t.id = patch.template_id;

commit;
