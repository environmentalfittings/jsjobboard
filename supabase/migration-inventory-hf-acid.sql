-- Customer inventory: HF Acid valve flag.
-- Safe to re-run.

alter table public.inventory add column if not exists hf_acid boolean not null default false;

comment on column public.inventory.hf_acid is 'True when this inventory item is an HF Acid valve';
