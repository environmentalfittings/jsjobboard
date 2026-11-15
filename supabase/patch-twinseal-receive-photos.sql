-- Twinseal receive step: 1 work-order photo + at least 4 before (as-found) photos.
-- Safe to re-run.

update public.itp_library_templates t
set
  scope = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            t.scope,
            '{sel,trv_i_01,requirePicture}',
            'true'::jsonb
          ),
          '{sel,trv_i_01,pictureLabel}',
          '"Before photos"'::jsonb
        ),
        '{sel,trv_i_01,minPhotos}',
        '4'::jsonb
      ),
      '{sel,trv_i_01,maxPhotos}',
      '8'::jsonb
    ),
    '{sel,trv_i_01,measFields}',
    case
      when exists (
        select 1
        from jsonb_array_elements(coalesce(t.scope #> '{sel,trv_i_01,measFields}', '[]'::jsonb)) f
        where f->>'id' = 'trv_i_01_wo'
           or lower(coalesce(f->>'label', '')) = 'work order'
      ) then coalesce(t.scope #> '{sel,trv_i_01,measFields}', '[]'::jsonb)
      else
        '[{"label":"Work order","type":"picture","options":[],"required":true,"maxPhotos":1,"id":"trv_i_01_wo"}]'::jsonb
        || coalesce(t.scope #> '{sel,trv_i_01,measFields}', '[]'::jsonb)
    end
  ),
  updated_at = now()
where t.job_type = 'repair'
  and t.valve_type = 'Twinseal'
  and t.name = 'Traveler - Twinseal';
