-- Fix: allocate_training_record_no was blocked by RLS on the sequence table.
-- Run once in Supabase SQL Editor, then retry Create & assign TR#.

begin;

-- Internal counter only — not read/written directly by the client.
alter table public.employee_training_number_seq disable row level security;

insert into public.employee_training_number_seq (id, next_num)
values (1, 8)
on conflict (id) do nothing;

create or replace function public.allocate_training_record_no()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.employee_training_number_seq
  set next_num = next_num + 1
  where id = 1
  returning next_num - 1 into n;

  if n is null then
    insert into public.employee_training_number_seq (id, next_num) values (1, 2)
    on conflict (id) do update set next_num = public.employee_training_number_seq.next_num + 1
    returning next_num - 1 into n;
  end if;

  return 'TR-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.allocate_training_record_no() from public;
grant execute on function public.allocate_training_record_no() to authenticated, anon;

commit;
