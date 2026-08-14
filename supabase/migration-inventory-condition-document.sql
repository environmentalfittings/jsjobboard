-- Customer inventory: new vs reconditioned + MTR/traveler PDF.
-- Safe to re-run.

alter table public.inventory
  add column if not exists condition text;

alter table public.inventory
  add column if not exists manufacturer_serial_no text;

alter table public.inventory
  add column if not exists repair_tag_number text;

alter table public.inventory
  add column if not exists document_url text;

alter table public.inventory
  add column if not exists document_name text;

alter table public.inventory
  add column if not exists document_storage_path text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_condition_check'
  ) then
    alter table public.inventory
      add constraint inventory_condition_check
      check (condition is null or condition in ('new', 'reconditioned'));
  end if;
end $$;

comment on column public.inventory.condition is 'new or reconditioned';
comment on column public.inventory.manufacturer_serial_no is 'Manufacturer serial number when condition is new';
comment on column public.inventory.repair_tag_number is 'Repair tag number when condition is reconditioned';
comment on column public.inventory.document_url is 'Public URL for uploaded MTR or traveler PDF';
comment on column public.inventory.document_name is 'Original PDF file name';
comment on column public.inventory.document_storage_path is 'Storage path in valve-attachments bucket for the PDF';
