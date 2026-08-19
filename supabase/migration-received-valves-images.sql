-- Support up to 4 pictures per received valve (JSONB array).
-- Safe to re-run. Legacy image_url / image_storage_path / image_name stay in sync for the first photo.

alter table public.received_valves
  add column if not exists images jsonb not null default '[]'::jsonb;

update public.received_valves
set images = jsonb_build_array(
  jsonb_build_object(
    'url', image_url,
    'storage_path', coalesce(image_storage_path, ''),
    'file_name', coalesce(nullif(trim(image_name), ''), 'Photo')
  )
)
where (image_url is not null or coalesce(image_storage_path, '') <> '')
  and images = '[]'::jsonb;
