-- Customer inventory photos + QR code columns.
-- Safe to re-run.

alter table public.inventory add column if not exists valve_image_url text;
alter table public.inventory add column if not exists tag_image_url text;
alter table public.inventory add column if not exists qr_code_data_url text;

comment on column public.inventory.valve_image_url is 'Public URL for required valve photo';
comment on column public.inventory.tag_image_url is 'Public URL for required tag photo';
comment on column public.inventory.qr_code_data_url is 'PNG data URL for the generated inventory QR code';

-- Keep legacy image_url in sync with valve photo when present (optional convenience).
-- No trigger required — app writes both.
