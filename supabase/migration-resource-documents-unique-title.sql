-- Run once in Supabase SQL Editor.
-- Prevents duplicate document titles within the same category.

begin;

-- Remove any existing duplicates first, keeping the most recently updated row.
delete from public.resource_documents
where id in (
  select id from (
    select id,
           row_number() over (
             partition by category, lower(trim(title))
             order by updated_at desc, id desc
           ) as rn
    from public.resource_documents
  ) ranked
  where rn > 1
);

-- Add the unique constraint (case-insensitive via a unique index on lower(title)).
create unique index if not exists uq_resource_documents_category_title
  on public.resource_documents (category, lower(trim(title)));

commit;
