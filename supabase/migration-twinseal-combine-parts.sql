-- Twinseal: keep one combined “Parts and bolting record” (parts_order).
-- Turns off legacy separate bolting-record steps and renames parts_order in templates.

begin;

update public.itp_library_templates t
set scope = (
  with
  base as (
    select t.scope as scope
  ),
  -- Exclude legacy custom rows that duplicate Parts and bolting (not parts_order).
  custom_filtered as (
    select coalesce(
      (
        select jsonb_agg(elem)
        from jsonb_array_elements(coalesce((select scope from base)->'custom', '[]'::jsonb)) elem
        where not (
          coalesce(elem->>'id', '') <> 'parts_order'
          and (
            lower(coalesce(elem->>'name', '')) ~ 'parts[[:space:]]+and[[:space:]]+bolting'
            or lower(coalesce(elem->>'name', '')) ~ '^parts[[:space:]]*record$'
          )
        )
      ),
      '[]'::jsonb
    ) as custom
  ),
  -- Ensure parts_order custom label exists.
  custom_with_parts as (
    select case
      when exists (
        select 1
        from jsonb_array_elements((select custom from custom_filtered)) e
        where e->>'id' = 'parts_order'
      ) then (
        select jsonb_agg(
          case
            when elem->>'id' = 'parts_order' then
              jsonb_set(
                jsonb_set(elem, '{name}', '"Parts and bolting record"'),
                '{detail}',
                coalesce(elem->'detail', '{}'::jsonb)
                  || jsonb_build_object(
                    'id', 'parts_order',
                    'name', 'Parts and bolting record',
                    'ref', 'Parts Record',
                    'area', 'Teardown'
                  )
              )
            else elem
          end
        )
        from jsonb_array_elements((select custom from custom_filtered)) elem
      )
      else (select custom from custom_filtered) || jsonb_build_array(
        jsonb_build_object(
          'id', 'parts_order',
          'secId', 'inspection',
          'name', 'Parts and bolting record',
          'detail', jsonb_build_object(
            'id', 'parts_order',
            'name', 'Parts and bolting record',
            'ref', 'Parts Record',
            'secId', 'inspection',
            'area', 'Teardown',
            'requireMeasurement', true
          )
        )
      )
    end as custom
  ),
  -- Mark matching sel entries (legacy trv_* bolting steps) as not included.
  sel_patched as (
    select jsonb_object_agg(
      key,
      case
        when key = 'parts_order' then
          value
          || jsonb_build_object(
            'included', true,
            'addToTraveler', true,
            'sectionId', coalesce(nullif(value->>'sectionId', ''), 'inspection'),
            'shopArea', coalesce(nullif(value->>'shopArea', ''), 'Teardown')
          )
        when exists (
          select 1
          from jsonb_array_elements(coalesce((select scope from base)->'custom', '[]'::jsonb)) c
          where c->>'id' = key
            and (
              lower(coalesce(c->>'name', '')) ~ 'parts[[:space:]]+and[[:space:]]+bolting'
              or lower(coalesce(c->>'name', '')) ~ '^parts[[:space:]]*record$'
            )
        ) then value || jsonb_build_object('included', false, 'addToTraveler', false)
        else value
      end
    ) as sel
    from jsonb_each(coalesce((select scope from base)->'sel', '{}'::jsonb)) as e(key, value)
  )
  select jsonb_set(
    jsonb_set((select scope from base), '{sel}', (select sel from sel_patched)),
    '{custom}',
    (select custom from custom_with_parts)
  )
)
where t.valve_type ilike '%twinseal%'
  and t.name like 'Traveler - %';

commit;
